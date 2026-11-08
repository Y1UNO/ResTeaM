//! Bibliothèque complète : les jeux possédés (Web API) croisés avec ce qui est
//! installé sur ce PC et avec les favoris et collections Steam (fichiers locaux).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::local::{Collections, EtatInstallation, JeuInstalle};
use super::webapi::JeuPossede;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub etat: EtatInstallation,
    pub taille: u64,
    pub dossier: String,
    pub a_telecharger: u64,
    pub telecharge: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JeuBibliotheque {
    #[serde(flatten)]
    pub jeu: JeuPossede,
    /// `None` = pas installé sur ce PC.
    pub installation: Option<Installation>,
    pub favori: bool,
    /// Masqué dans Steam.
    pub cache: bool,
    /// Identifiants des collections qui contiennent ce jeu.
    pub collections: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeCollection {
    pub id: String,
    pub nom: String,
    pub nombre: usize,
    pub dynamique: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bibliotheque {
    pub jeux: Vec<JeuBibliotheque>,
    pub collections: Vec<ResumeCollection>,
    pub nombre_installes: usize,
    pub nombre_favoris: usize,
    /// Faux si Steam n'a pas été trouvé sur ce PC (installés, favoris et collections vides).
    pub steam_local: bool,
}

pub fn fusionner(possedes: Vec<JeuPossede>, installes: &[JeuInstalle], c: &Collections, steam_local: bool) -> Bibliotheque {
    let par_id: HashMap<u32, &JeuInstalle> = installes.iter().map(|j| (j.app_id, j)).collect();
    let mut jeux: Vec<JeuBibliotheque> = possedes
        .into_iter()
        .map(|jeu| {
            let id = jeu.app_id;
            JeuBibliotheque {
                installation: par_id.get(&id).map(|i| Installation {
                    etat: i.etat,
                    taille: i.taille,
                    dossier: i.dossier.clone(),
                    a_telecharger: i.a_telecharger,
                    telecharge: i.telecharge,
                }),
                favori: c.favoris.contains(&id),
                cache: c.caches.contains(&id),
                collections: c.liste.iter().filter(|col| col.jeux.contains(&id)).map(|col| col.id.clone()).collect(),
                jeu,
            }
        })
        .collect();
    jeux.sort_by(|a, b| a.jeu.nom.to_lowercase().cmp(&b.jeu.nom.to_lowercase()));
    Bibliotheque {
        nombre_installes: jeux.iter().filter(|j| j.installation.is_some()).count(),
        nombre_favoris: jeux.iter().filter(|j| j.favori).count(),
        collections: c
            .liste
            .iter()
            .map(|col| ResumeCollection {
                id: col.id.clone(),
                nom: col.nom.clone(),
                nombre: col.jeux.len(),
                dynamique: col.dynamique,
            })
            .collect(),
        jeux,
        steam_local,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::steam::local::Collection;

    fn possede(id: u32, nom: &str) -> JeuPossede {
        JeuPossede {
            app_id: id,
            nom: nom.into(),
            minutes_total: 0,
            minutes_deux_semaines: 0,
            icone: String::new(),
            dernier_lancement: 0,
        }
    }

    #[test]
    fn croisement() {
        let installes = vec![JeuInstalle {
            app_id: 2,
            nom: "B".into(),
            dossier: "E:\\B".into(),
            bibliotheque: "E:\\".into(),
            taille: 10,
            etat: EtatInstallation::Installe,
            a_telecharger: 0,
            telecharge: 0,
            derniere_maj: 0,
            dernier_lancement: 0,
        }];
        let c = Collections {
            trouve: true,
            favoris: vec![1],
            caches: vec![],
            liste: vec![Collection { id: "uc-x".into(), nom: "Coop".into(), jeux: vec![1, 2], dynamique: false }],
        };
        let b = fusionner(vec![possede(2, "bravo"), possede(1, "Alpha")], &installes, &c, true);
        assert_eq!(b.jeux[0].jeu.nom, "Alpha", "tri alphabétique sans tenir compte de la casse");
        assert!(b.jeux[0].favori && b.jeux[0].installation.is_none());
        assert!(!b.jeux[1].favori && b.jeux[1].installation.is_some());
        assert_eq!(b.jeux[1].collections, vec!["uc-x".to_string()]);
        assert_eq!((b.nombre_installes, b.nombre_favoris), (1, 1));
        assert_eq!(b.collections[0].nombre, 2);
    }
}
