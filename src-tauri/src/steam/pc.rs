//! Configuration de ce PC, pour la comparer à la configuration requise d'un jeu :
//! Windows, mémoire vive, processeur, carte graphique (registre) et espace libre.

use serde::Serialize;
use sysinfo::{CpuRefreshKind, Disks, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPc {
    /// « Windows 11 (26200) ».
    pub systeme: String,
    /// Octets.
    pub memoire: u64,
    pub processeur: String,
    pub coeurs: usize,
    pub carte_graphique: Option<String>,
    /// Mémoire de la carte graphique, en octets.
    pub memoire_graphique: Option<u64>,
    /// Plus grand espace libre parmi les disques.
    pub espace_libre_max: u64,
}

pub fn config_pc() -> ConfigPc {
    let mut sys = System::new().ok();
    let (memoire, processeur, coeurs) = match sys.as_mut() {
        Some(s) => {
            s.refresh_memory();
            s.refresh_cpu_list(CpuRefreshKind::nothing());
            let cpu = s.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default();
            (s.total_memory(), cpu, s.cpus().len())
        }
        None => (0, String::new(), 0),
    };
    let (carte_graphique, memoire_graphique) = carte_graphique();
    let espace_libre_max = Disks::new_with_refreshed_list()
        .map(|l| l.iter().map(|d| d.available_space()).max().unwrap_or(0))
        .unwrap_or(0);
    ConfigPc {
        systeme: System::long_os_version().unwrap_or_else(|_| "Windows".into()),
        memoire,
        processeur,
        coeurs,
        carte_graphique,
        memoire_graphique,
        espace_libre_max,
    }
}

/// Carte graphique principale (celle qui a le plus de mémoire), lue dans le registre.
fn carte_graphique() -> (Option<String>, Option<u64>) {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        const CLASSE: &str = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        let Ok(classe) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(CLASSE) else { return (None, None) };
        let mut meilleure: Option<(String, u64)> = None;
        for n in 0..16 {
            let Ok(cle) = classe.open_subkey(format!("{n:04}")) else { continue };
            let Ok(nom) = cle.get_value::<String, _>("DriverDesc") else { continue };
            if nom.contains("Basic Display") || nom.contains("Remote") {
                continue;
            }
            let memoire = cle
                .get_value::<u64, _>("HardwareInformation.qwMemorySize")
                .or_else(|_| cle.get_value::<u32, _>("HardwareInformation.MemorySize").map(u64::from))
                .unwrap_or(0);
            if meilleure.as_ref().is_none_or(|(_, m)| memoire > *m) {
                meilleure = Some((nom, memoire));
            }
        }
        return match meilleure {
            Some((nom, m)) => (Some(nom), (m > 0).then_some(m)),
            None => (None, None),
        };
    }
    #[allow(unreachable_code)]
    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ce_pc() {
        let c = config_pc();
        println!("{c:?}");
        assert!(c.memoire > 0);
        assert!(!c.processeur.is_empty());
    }
}
