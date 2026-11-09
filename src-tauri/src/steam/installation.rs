//! Installation d'un jeu sans la fenêtre de Steam (accord de Tom, 8 nov. 2026) :
//! 1. l'app écrit un manifeste « à installer » (`appmanifest_<id>.acf`, StateFlags 1026)
//!    dans le dossier `steamapps` du disque choisi ;
//! 2. elle redémarre Steam en arrière-plan (`-shutdown`, puis `-silent`) ;
//! 3. Steam lit le manifeste et télécharge le jeu tout seul, sans fenêtre.
//!
//! Garde-fous : le dossier doit être une bibliothèque Steam déclarée et le jeu ne doit
//! pas déjà être installé. Le redémarrage passe par la file de `redemarrage.rs`,
//! qui attend la fin du jeu en cours (le redémarrage le couperait).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use sysinfo::{Disks, ProcessRefreshKind, ProcessesToUpdate, System};

use super::local;
use crate::erreur::{Erreur, Resultat};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disque {
    /// Dossier de bibliothèque Steam sur ce disque (`E:\SteamLibrary`).
    pub bibliotheque: String,
    /// `E:`
    pub lecteur: String,
    /// Nom du volume (« Data »), s'il existe.
    pub nom: String,
    pub libre: u64,
    pub total: u64,
}

/// Disques qui portent une bibliothèque Steam, avec leur espace libre réel.
pub fn disques(steam: &Path) -> Vec<Disque> {
    let Ok(liste) = Disks::new_with_refreshed_list() else { return vec![] };
    local::dossiers_bibliotheque(steam)
        .into_iter()
        .filter_map(|b| {
            let chemin = PathBuf::from(&b.chemin);
            // Le disque dont le point de montage est le plus long préfixe du chemin.
            let d = liste
                .iter()
                .filter(|d| prefixe_insensible(&chemin, d.mount_point()))
                .max_by_key(|d| d.mount_point().as_os_str().len())?;
            Some(Disque {
                bibliotheque: b.chemin.clone(),
                lecteur: d.mount_point().to_string_lossy().trim_end_matches('\\').to_string(),
                nom: d.name().to_string_lossy().into_owned(),
                libre: d.available_space(),
                total: d.total_space(),
            })
        })
        .collect()
}

fn prefixe_insensible(chemin: &Path, prefixe: &Path) -> bool {
    chemin.to_string_lossy().to_lowercase().starts_with(&prefixe.to_string_lossy().to_lowercase())
}

/// Jeu en cours selon Steam (registre `RunningAppID`), ou `None`.
pub fn jeu_en_cours() -> Option<u32> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let cle = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam").ok()?;
        let id: u32 = cle.get_value("RunningAppID").ok()?;
        return (id != 0).then_some(id);
    }
    #[allow(unreachable_code)]
    None
}

/// Le jeu a-t-il déjà un manifeste dans une des bibliothèques ?
pub fn deja_installe(steam: &Path, app_id: u32) -> bool {
    local::dossiers_bibliotheque(steam)
        .iter()
        .any(|d| Path::new(&d.chemin).join("steamapps").join(format!("appmanifest_{app_id}.acf")).exists())
}

/// Nom de dossier sûr pour Windows (`installdir`).
pub fn nom_dossier(nom: &str) -> String {
    let propre: String = nom
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') && !c.is_control())
        .collect();
    let propre = propre.trim().trim_end_matches('.').trim().to_string();
    if propre.is_empty() { "Jeu".into() } else { propre }
}

fn echapper_vdf(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn contenu_manifeste(app_id: u32, nom: &str, steam_id: &str) -> String {
    let nom_vdf = echapper_vdf(nom);
    let dossier = echapper_vdf(&nom_dossier(nom));
    format!(
        "\"AppState\"\n{{\n\
         \t\"appid\"\t\t\"{app_id}\"\n\
         \t\"Universe\"\t\t\"1\"\n\
         \t\"name\"\t\t\"{nom_vdf}\"\n\
         \t\"StateFlags\"\t\t\"1026\"\n\
         \t\"installdir\"\t\t\"{dossier}\"\n\
         \t\"LastUpdated\"\t\t\"0\"\n\
         \t\"SizeOnDisk\"\t\t\"0\"\n\
         \t\"buildid\"\t\t\"0\"\n\
         \t\"LastOwner\"\t\t\"{steam_id}\"\n\
         \t\"BytesToDownload\"\t\t\"0\"\n\
         \t\"BytesDownloaded\"\t\t\"0\"\n\
         \t\"AutoUpdateBehavior\"\t\t\"0\"\n\
         \t\"AllowOtherDownloadsWhileRunning\"\t\t\"0\"\n\
         \t\"ScheduledAutoUpdate\"\t\t\"0\"\n\
         \t\"UserConfig\"\n\t{{\n\t}}\n\
         \t\"MountedConfig\"\n\t{{\n\t}}\n\
         }}\n"
    )
}

/// Écrit le manifeste « à installer » dans la bibliothèque choisie (vérifiée).
pub fn ecrire_manifeste(steam: &Path, bibliotheque: &str, app_id: u32, nom: &str, steam_id: &str) -> Resultat<PathBuf> {
    let autorisee = local::dossiers_bibliotheque(steam)
        .into_iter()
        .any(|d| d.chemin.eq_ignore_ascii_case(bibliotheque));
    if !autorisee {
        return Err(Erreur::Interne("ce dossier n'est pas une bibliothèque Steam".into()));
    }
    if deja_installe(steam, app_id) {
        return Err(Erreur::Interne("ce jeu est déjà installé ou en cours d'installation".into()));
    }
    let chemin = Path::new(bibliotheque).join("steamapps").join(format!("appmanifest_{app_id}.acf"));
    fs::write(&chemin, contenu_manifeste(app_id, nom, steam_id))?;
    Ok(chemin)
}

fn processus_steam(sys: &mut System) -> bool {
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes_by_exact_name("steam.exe".as_ref()).next().is_some()
}

/// Ferme Steam proprement puis le relance en arrière-plan (sans fenêtre principale).
#[allow(dead_code)]
pub async fn redemarrer_steam(steam: &Path) -> Resultat<()> {
    redemarrer_steam_avec(steam, |_| {}).await
}

/// Ferme Steam proprement, exécute `pendant` (Steam fermé : on peut toucher à ses
/// fichiers sans qu'il les réécrive), puis le relance en arrière-plan.
pub async fn redemarrer_steam_avec<F>(steam: &Path, pendant: F) -> Resultat<()>
where
    F: FnOnce(&Path) + Send + 'static,
{
    let exe = steam.join("steam.exe");
    if !exe.exists() {
        return Err(Erreur::SteamIntrouvable);
    }
    let mut sys = System::new().map_err(|e| Erreur::Interne(format!("lecture des processus : {e}")))?;
    if processus_steam(&mut sys) {
        lancer(&exe, "-shutdown")?;
        let mut ferme = false;
        for _ in 0..90 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if !processus_steam(&mut sys) {
                ferme = true;
                break;
            }
        }
        if !ferme {
            return Err(Erreur::Interne("Steam ne s'est pas fermé à temps".into()));
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    let dossier = steam.to_path_buf();
    let _ = tokio::task::spawn_blocking(move || pendant(&dossier)).await;
    lancer(&exe, "-silent")
}

/// Lance Steam caché s'il ne tourne pas encore (au démarrage de ResTeaM,
/// préférence « Démarrer Steam caché »), puis renvoie sa fenêtre si elle s'ouvre.
pub async fn demarrer_steam_cache(steam: &Path) -> Resultat<()> {
    let exe = steam.join("steam.exe");
    if !exe.exists() {
        return Err(Erreur::SteamIntrouvable);
    }
    let mut sys = System::new().map_err(|e| Erreur::Interne(format!("lecture des processus : {e}")))?;
    if processus_steam(&mut sys) {
        return Ok(());
    }
    lancer(&exe, "-silent")?;
    cacher_fenetre_steam().await;
    Ok(())
}

/// Supprime un manifeste « à installer » écrit par ResTeaM et que Steam n'a pas
/// encore pris en charge (installation annulée avant le redémarrage).
pub fn retirer_manifeste_non_lu(steam: &Path, app_id: u32) {
    for d in local::dossiers_bibliotheque(steam) {
        let chemin = Path::new(&d.chemin).join("steamapps").join(format!("appmanifest_{app_id}.acf"));
        let Ok(texte) = fs::read_to_string(&chemin) else { continue };
        let racine = super::vdf::lire(&texte);
        let Some(a) = racine.get("AppState") else { continue };
        let intact = a.nombre::<u32>("StateFlags") == Some(1026)
            && a.nombre::<u64>("buildid") == Some(0)
            && a.nombre::<u64>("LastUpdated") == Some(0);
        if intact {
            let _ = fs::remove_file(&chemin);
        }
    }
}

/// Après un redémarrage, Steam peut quand même ouvrir sa fenêtre principale :
/// pendant 40 s, on la renvoie dans la zone de notification (comme un clic sur ×).
/// Seule la grande fenêtre « Steam » est visée, jamais celle de connexion.
pub async fn cacher_fenetre_steam() {
    #[cfg(windows)]
    for _ in 0..80 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let _ = tokio::task::spawn_blocking(fenetre::fermer_fenetre_principale).await;
    }
}

#[cfg(windows)]
mod fenetre {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        PostMessageW, WM_CLOSE,
    };

    struct Recherche {
        pids: Vec<u32>,
        trouvees: Vec<HWND>,
    }

    fn texte(buf: &[u16], n: i32) -> String {
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    unsafe extern "system" fn visiter(hwnd: HWND, lparam: LPARAM) -> i32 {
        // SAFETY : `lparam` pointe sur la `Recherche` de `fermer_fenetre_principale`,
        // vivante pendant tout `EnumWindows` ; `hwnd` vient de Windows.
        unsafe {
            let r = &mut *(lparam as *mut Recherche);
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if !r.pids.contains(&pid) {
                return 1;
            }
            let mut classe = [0u16; 64];
            let n = GetClassNameW(hwnd, classe.as_mut_ptr(), classe.len() as i32);
            let mut titre = [0u16; 64];
            let m = GetWindowTextW(hwnd, titre.as_mut_ptr(), titre.len() as i32);
            let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            GetWindowRect(hwnd, &mut rect);
            let grande = rect.right - rect.left >= 800 && rect.bottom - rect.top >= 500;
            if texte(&classe, n) == "SDL_app" && texte(&titre, m) == "Steam" && grande {
                r.trouvees.push(hwnd);
            }
            1
        }
    }

    pub fn fermer_fenetre_principale() {
        let Ok(mut sys) = System::new() else { return };
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        let pids: Vec<u32> = sys
            .processes()
            .iter()
            .filter(|(_, p)| {
                let n = p.name().to_string_lossy().to_lowercase();
                n == "steam.exe" || n == "steamwebhelper.exe"
            })
            .map(|(pid, _)| pid.as_u32())
            .collect();
        if pids.is_empty() {
            return;
        }
        let mut r = Recherche { pids, trouvees: vec![] };
        unsafe {
            EnumWindows(Some(visiter), &mut r as *mut Recherche as LPARAM);
            for h in r.trouvees {
                PostMessageW(h, WM_CLOSE, 0, 0);
            }
        }
    }
}

fn lancer(exe: &Path, argument: &str) -> Resultat<()> {
    let mut c = std::process::Command::new(exe);
    c.arg(argument)
        // Aucune poignée héritée : Steam ne garde rien ouvert de ResTeaM.
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS : Steam ne dépend pas de ResTeaM.
        c.creation_flags(0x0000_0008);
    }
    c.spawn().map(|_| ()).map_err(|e| Erreur::Interne(format!("lancement de Steam : {e}")))
}

/// Raccourci `.url` qui lance le jeu par Steam (bureau ou menu Démarrer).
pub fn creer_raccourci(dossier: &Path, app_id: u32, nom: &str, steam: &Path) -> Resultat<()> {
    fs::create_dir_all(dossier)?;
    let chemin = dossier.join(format!("{}.url", nom_dossier(nom)));
    if chemin.exists() {
        return Ok(());
    }
    let icone = steam.join("steam.exe");
    fs::write(
        chemin,
        format!(
            "[InternetShortcut]\r\nURL=steam://rungameid/{app_id}\r\nIconFile={}\r\nIconIndex=0\r\n",
            icone.display()
        ),
    )?;
    Ok(())
}

/// « Espace disque : 15 GB d'espace disque disponible » → octets.
pub fn taille_depuis_config(html: &str) -> Option<u64> {
    let bas = html.to_lowercase();
    let debut = ["espace disque", "storage", "hard drive", "hard disk", "disk space"]
        .iter()
        .filter_map(|m| bas.find(m).map(|i| i + m.len()))
        .min()?;
    let extrait: String = bas[debut..].chars().take(80).collect();
    let mut nombre = String::new();
    let mut reste = "";
    for (i, c) in extrait.char_indices() {
        if c.is_ascii_digit() || ((c == '.' || c == ',') && !nombre.is_empty()) {
            nombre.push(if c == ',' { '.' } else { c });
        } else if !nombre.is_empty() {
            reste = &extrait[i..];
            break;
        }
    }
    let valeur: f64 = nombre.trim_end_matches('.').parse().ok()?;
    let unite = reste.trim_start();
    let facteur = if unite.starts_with("tb") || unite.starts_with("to") {
        1e12
    } else if unite.starts_with("gb") || unite.starts_with("go") {
        1e9
    } else if unite.starts_with("mb") || unite.starts_with("mo") {
        1e6
    } else {
        return None;
    };
    Some((valeur * facteur) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taille() {
        let html = "<li><strong>Mémoire vive :</strong> 4 GB de mémoire<br></li><li><strong>Espace disque :</strong> 15 GB d'espace disque disponible</li>";
        assert_eq!(taille_depuis_config(html), Some(15_000_000_000));
        assert_eq!(taille_depuis_config("<strong>Storage:</strong> 2.5 GB available space"), Some(2_500_000_000));
        assert_eq!(taille_depuis_config("Hard Drive: 500 MB"), Some(500_000_000));
        assert_eq!(taille_depuis_config("Storage: 70 Go"), Some(70_000_000_000));
        assert_eq!(taille_depuis_config("rien d'utile"), None);
    }

    #[test]
    fn dossier_et_manifeste() {
        assert_eq!(nom_dossier("Clair Obscur: Expedition 33"), "Clair Obscur Expedition 33");
        assert_eq!(nom_dossier("What?*"), "What");
        assert_eq!(nom_dossier("..."), "Jeu");
        let m = contenu_manifeste(1145360, "Hades", "76561198000000000");
        let lu = super::super::vdf::lire(&m);
        let app = lu.get("AppState").unwrap();
        assert_eq!(app.nombre::<u32>("appid"), Some(1145360));
        assert_eq!(app.nombre::<u32>("StateFlags"), Some(1026));
        assert_eq!(app.texte("installdir"), Some("Hades"));
        // Guillemets échappés : le fichier reste lisible.
        let m = contenu_manifeste(1, "Le \"Jeu\"", "1");
        assert_eq!(super::super::vdf::lire(&m).get("AppState").unwrap().texte("name"), Some("Le \"Jeu\""));
    }

    #[test]
    #[ignore]
    fn disques_de_ce_pc() {
        let steam = local::dossier_steam().unwrap();
        for d in disques(&steam) {
            println!("{} ({}) · {} · {} Go libres sur {}", d.lecteur, d.nom, d.bibliotheque, d.libre / 1_000_000_000, d.total / 1_000_000_000);
        }
        println!("Jeu en cours : {:?}", jeu_en_cours());
    }
}

// ——— Données du PC pendant un téléchargement ———

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceDisque {
    pub lecteur: String,
    pub libre: u64,
}

/// Compteurs cumulés : le front en déduit des débits entre deux lectures.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSysteme {
    pub horodatage_ms: u64,
    /// Octets reçus par toutes les cartes réseau depuis leur démarrage.
    pub reseau_recu: u64,
    /// Octets écrits sur le disque par Steam (`steam.exe`) depuis son lancement.
    pub steam_ecrit: Option<u64>,
    pub disques: Vec<EspaceDisque>,
}

pub fn stats_systeme() -> StatsSysteme {
    let reseau_recu = sysinfo::Networks::new_with_refreshed_list()
        .map(|n| n.iter().map(|(_, d)| d.total_received()).sum())
        .unwrap_or(0);
    let steam_ecrit = System::new().ok().and_then(|mut sys| {
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_disk_usage());
        let total: u64 = sys
            .processes_by_exact_name("steam.exe".as_ref())
            .map(|p| p.disk_usage().total_written_bytes)
            .sum();
        (total > 0).then_some(total)
    });
    let disques = Disks::new_with_refreshed_list()
        .map(|l| {
            l.iter()
                .map(|d| EspaceDisque {
                    lecteur: d.mount_point().to_string_lossy().trim_end_matches('\\').to_string(),
                    libre: d.available_space(),
                })
                .collect()
        })
        .unwrap_or_default();
    StatsSysteme {
        horodatage_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        reseau_recu,
        steam_ecrit,
        disques,
    }
}

/// Vrai test demandé par Tom (8 nov. 2026) : installe Hades (1145360) sur E:\SteamLibrary
/// sans fenêtre Steam, puis suit la progression pendant 3 minutes.
/// `cargo test installer_hades_reel -- --ignored --nocapture`
#[cfg(test)]
mod test_reel {
    use super::*;

    #[test]
    #[ignore]
    fn installer_hades_reel() {
        const HADES: u32 = 1145360;
        let steam = local::dossier_steam().expect("Steam introuvable");
        assert_eq!(jeu_en_cours(), None, "un jeu tourne : on ne redémarre pas Steam");
        let appdata = std::env::var("APPDATA").unwrap();
        let session = fs::read_to_string(format!("{appdata}/com.yiuno.resteam/session.json")).unwrap();
        let sid = serde_json::from_str::<serde_json::Value>(&crate::coffre::lire(&session).unwrap()).unwrap()["steamId"].as_str().unwrap().to_string();
        let biblio = local::dossiers_bibliotheque(&steam)
            .into_iter()
            .find(|d| d.chemin.to_lowercase().starts_with("e:"))
            .expect("bibliothèque E: introuvable")
            .chemin;

        let manifeste = ecrire_manifeste(&steam, &biblio, HADES, "Hades", &sid).unwrap();
        println!("Manifeste écrit : {}", manifeste.display());
        tauri::async_runtime::block_on(redemarrer_steam(&steam)).unwrap();
        println!("Steam redémarré en arrière-plan.");

        for i in 0..18 {
            std::thread::sleep(Duration::from_secs(10));
            let jeu = local::jeux_installes(&steam).into_iter().find(|j| j.app_id == HADES);
            match jeu {
                Some(j) => println!(
                    "{:>3} s · {:?} · {} / {} octets · {} sur le disque",
                    (i + 1) * 10, j.etat, j.telecharge, j.a_telecharger, j.taille
                ),
                None => println!("{:>3} s · manifeste absent", (i + 1) * 10),
            }
        }
    }
}
