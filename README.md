# SeaCraft

> **Seafile-first workspace portal** powered by the **ArtCraft (`storytold`)** Rust/WebAssembly suite, local & Seafile sync, `.history/` snapshots, **eSCL OCR scanning**, and **IPP network printing**.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#) [![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB)](#) [![ArtCraft WASM](https://img.shields.io/badge/ArtCraft-13%20WASM%20Apps-e95420)](#) [![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8)](#)

---

## English

### Overview

**SeaCraft** combines the reliability and library structure of **Seafile** with the full **ArtCraft (`storytold`)** creative & productivity suite running directly in your browser via WebAssembly — with zero external CDN dependencies and 100% offline/LAN availability.

- **Seafile-First Front Page**: Your libraries, folders, and files take center stage in a clean table or grid view with inline **Download**, **Print**, and **Delete** actions.
- **Compact Quick Launch Bar**: Pin your most-used tools (`WordCraft`, `GridCraft`, `DeckCraft`, `Scanner`) at the top and open all **13 ArtCraft WASM apps** anytime via **All Apps (13)**.
- **Sync & Versioning**:
  - Background `sync_client.js` daemon watches your local storage (`fs.watch`) and optionally connects to any **Seafile Server** (`/api2/repos/...`).
  - Automatic `.history/` snapshot creation before every overwrite or delete, with 1-click **Version History** restore.
- **Hardware Scanner & Printer Integration**:
  - **eSCL / AirScan** flatbed scanning & LAN auto-discovery (`airscan-discover`).
  - **Tesseract OCR** (`ell+eng`) converting scans or uploaded photos directly into `.docx`, `.xlsx`, searchable `.pdf`, `.png`, or `.jpg` inside your library.
  - **Network IPP Printing** (port `631 /ipp/print`) + **Browser Print**.
- **Installable**: Includes a 1-command Linux `systemd` installer (`install.sh`) **and** Progressive Web App (`manifest.webmanifest` + `sw.js`) support.

### Included ArtCraft (`storytold`) WASM Apps

| Category | Apps | Supported Formats |
| :--- | :--- | :--- |
| **Office & Productivity** | **WordCraft**, **GridCraft**, **DeckCraft**, **PdfCraft**, **DesignCraft**, **Boardcraft** | `.docx`, `.rtf`, `.xlsx`, `.ods`, `.pptx`, `.odp`, `.pdf`, `.bcraft` |
| **Images & Design** | **PhotoCraft**, **LightCraft**, **VectorCraft**, **FigCraft** | `.png`, `.jpg`, `.webp`, `.dng`, `.raw`, `.svg`, `.fig` |
| **Video, Audio & CAD** | **FilmCraft**, **EffectCraft**, **SoundCraft**, **CADCraft** | `.mp4`, `.mov`, `.webm`, `.wav`, `.mp3`, `.flac`, `.dxf`, `.dwg` |

### Quick Install (Linux / LXC / systemd)

```bash
git clone https://github.com/kmilkos/seacraft.git
cd seacraft
chmod +x install.sh
sudo ./install.sh
```

The installer will:
1. Install optional OS dependencies (`tesseract-ocr`, `tesseract-ocr-ell`, `sane-airscan`, `python3-pil`).
2. Create `config.json` from `config.example.json` and initialize storage permissions.
3. Download the latest official `storytold/*` WebAssembly builds into `public/apps/`.
4. Register and start `seacraft-portal.service` (listening on `0.0.0.0:3001`) and `seacraft-sync.service`.

Open **`http://<YOUR_SERVER_IP>:3001`** in any browser (and click **Install App** in your browser bar for desktop/mobile PWA mode).

### Configuration (`config.json`)

```json
{
  "seafileServer": "https://your-seafile-server",
  "seafileToken": "your-api-token",
  "repoId": "your-library-repo-id",
  "syncIntervalMs": 30000,
  "localLibrary": "CraftOffice",
  "storageDir": "/outer/CraftOffice",
  "deviceIp": "192.168.1.149"
}
```
You can also configure Seafile credentials and scanner/printer IPs directly from the Web Portal UI.

---

## 🇬🇷 Ελληνικά

### Επισκόπηση

Το **SeaCraft** συνδυάζει τη δομή και αξιοπιστία του **Seafile** (Libraries, φάκελοι, συγχρονισμός, ιστορικό εκδόσεων) με την πλήρη σουίτα εφαρμογών **ArtCraft (`storytold`)** σε WebAssembly — τρέχοντας 100% τοπικά στο δίκτυό σας (LAN / offline) χωρίς εξωτερικά CDNs.

- **Seafile-First Αρχική Σελίδα**: Τα αρχεία και οι φάκελοί σας βρίσκονται στο κέντρο (σε προβολή πίνακα ή πλέγματος) με άμεσες ενέργειες **Download**, **Print** και **Delete**.
- **Συμπαγής Μπάρα Quick Launch**: Άμεση πρόσβαση στα βασικά εργαλεία (`WordCraft`, `GridCraft`, `DeckCraft`, `Scanner`) και το κουμπί **All Apps (13)** για όλη τη σουίτα.
- **Συγχρονισμός & Ιστορικό Εκδόσεων**:
  - Το background daemon `sync_client.js` παρακολουθεί τοπικά τα αρχεία (`fs.watch`) και συνδέεται προαιρετικά με εξωτερικό **Seafile Server**.
  - Αυτόματα αντίγραφα ασφαλείας στον φάκελο `.history/` πριν από κάθε αποθήκευση ή διαγραφή, με επαναφορά 1-κλικ (**Version History**).
- **Ενσωμάτωση Σκάνερ & Εκτυπωτή**:
  - Σάρωση από δικτυακό σκάνερ **eSCL / AirScan** με αυτόματη εύρεση στο LAN (`airscan-discover`).
  - **Tesseract OCR** (`ell+eng` — Ελληνικά & Αγγλικά) για μετατροπή σκαναρισμένων εγγράφων ή φωτογραφιών απευθείας σε `.docx`, `.xlsx`, searchable `.pdf`, `.png` ή `.jpg`.
  - Δικτυακή εκτύπωση **IPP** (πόρτα `631 /ipp/print`) και **Browser Print**.
- **Εγκαταστάσιμο**: Διαθέτει αυτόματο installer (`install.sh`) για `systemd` και υποστήριξη **PWA (Progressive Web App)** για εγκατάσταση σε desktop & κινητό.

### Ενσωματωμένες Εφαρμογές ArtCraft (`storytold`)

| Κατηγορία | Εφαρμογές | Υποστηριζόμενοι Τύποι |
| :--- | :--- | :--- |
| **Γραφείο (Office)** | **WordCraft**, **GridCraft**, **DeckCraft**, **PdfCraft**, **DesignCraft**, **Boardcraft** | `.docx`, `.rtf`, `.xlsx`, `.ods`, `.pptx`, `.odp`, `.pdf`, `.bcraft` |
| **Εικόνα & Σχεδιασμός** | **PhotoCraft**, **LightCraft**, **VectorCraft**, **FigCraft** | `.png`, `.jpg`, `.webp`, `.dng`, `.raw`, `.svg`, `.fig` |
| **Βίντεο, Ήχος & CAD** | **FilmCraft**, **EffectCraft**, **SoundCraft**, **CADCraft** | `.mp4`, `.mov`, `.webm`, `.wav`, `.mp3`, `.flac`, `.dxf`, `.dwg` |

### Γρήγορη Εγκατάσταση (Linux / LXC / systemd)

```bash
git clone https://github.com/kmilkos/seacraft.git
cd seacraft
chmod +x install.sh
sudo ./install.sh
```

Ο installer θα εκτελέσει αυτόματα:
1. Έλεγχο/εγκατάσταση των απαραίτητων πακέτων (`tesseract-ocr`, `tesseract-ocr-ell`, `sane-airscan`, `python3-pil`).
2. Δημιουργία του `config.json` και ρύθμιση δικαιωμάτων αποθήκευσης.
3. Λήψη των επίσημων WebAssembly builds από το `storytold/*` μέσα στον φάκελο `public/apps/`.
4. Εγκατάσταση και εκκίνηση των υπηρεσιών `seacraft-portal.service` (στην πόρτα `0.0.0.0:3001`) και `seacraft-sync.service`.

Ανοίξτε **`http://<IP_ΤΟΥ_SERVER>:3001`** στον browser σας (μπορείτε να πατήσετε **Install App** στη γραμμή διευθύνσεων για εγκατάσταση ως PWA).
