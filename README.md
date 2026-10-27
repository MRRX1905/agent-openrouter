# R3X Agent Studio

Aplikasi desktop untuk membangun proyek perangkat lunak dengan agent AI. Agent merencanakan pekerjaan, menulis file, menjalankan perintah, memeriksa kualitas, dan menyiapkan publikasi ke GitHub.

## Fitur

- Proyek lokal dengan workspace terisolasi dan riwayat percakapan.
- Agent loop berbasis OpenRouter dengan tool `read_file`, `write_file`, `list_files`, `run_command`, `git_status`, dan `git_diff`.
- Approval untuk perintah berisiko, dengan audit trail.
- Terminal real-time dan tombol Stop.
- Quality gate: secret scan, local checks, README, dan Definition of Done.
- Pencarian dan instalasi skill dari skills.sh, review sebelum diaktifkan.
- GitHub Device Flow, preflight, pembuatan repo private, dan push.
- Backup database SQLite dan statistik penggunaan request.
- Budget guard harian untuk request OpenRouter.

## Stack

- Electron 45
- React 19 + TypeScript 7
- electron-vite 6
- SQLite via `node:sqlite`
- electron-builder 26 (NSIS)

## Prasyarat

- Node.js 24 atau lebih baru
- npm
- Git (untuk fitur repository dan publish)
- Windows 10/11 untuk target installer NSIS

Tidak memerlukan Rust atau native module.

## Menjalankan

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
```

Membuat installer Windows:

```bash
npm run dist
```

Installer dibuat di `release/`.

## Konfigurasi

Buka halaman **Settings** di aplikasi.

| Setting | Default | Keterangan |
|---|---|---|
| OpenRouter API key | kosong | Disimpan terenkripsi dengan Electron `safeStorage` |
| Model | `openrouter/auto` | Model OpenRouter yang dipakai agent |
| Workspace root | `Documents/R3X-Projects` | Lokasi proyek baru |
| Daily request cap | `50` | Batas request OpenRouter per hari |
| Repair reserve | `20%` | Cadangan budget untuk perbaikan |
| Mode | `supervised` | `auto`, `supervised`, atau `repair` |
| GitHub client ID | kosong | Client ID OAuth App untuk Device Flow |

Perubahan `workspaceRoot` berlaku setelah aplikasi dijalankan ulang.

## Setup GitHub

1. Buka **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Isi **Homepage URL** dan **Authorization callback URL** dengan `http://localhost`.
3. Aktifkan **Enable Device Flow**.
4. Salin **Client ID** ke Settings aplikasi. Client secret tidak diperlukan.
5. Di aplikasi, klik **Connect GitHub**, buka `https://github.com/login/device`, lalu masukkan kode yang ditampilkan.

Scope yang diminta adalah `repo`. Token disimpan di `SecretBox` dan tidak pernah dikirim ke renderer.

## Alur Pemakaian

1. Buat proyek baru dari halaman **New Project**.
2. Isi brief, pilih mode, lalu mulai job.
3. Agent akan meminta approval sebelum menjalankan perintah yang membutuhkan izin.
4. Pantau terminal dan pesan agent di halaman proyek.
5. Saat tahap review, periksa hasil quality gate dan perbaiki jika perlu.
6. Setelah selesai, jalankan preflight GitHub lalu publish.

## Keamanan

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Navigasi dan pembukaan window baru diblokir; permission request ditolak.
- API key dan token disimpan terenkripsi, bukan di renderer atau file plaintext.
- Path tool dibatasi ke workspace, termasuk pemeriksaan symlink.
- Perintah dijalankan dengan `spawn` tanpa shell; environment rahasia dibersihkan.
- Policy engine memblokir perintah kritikal dan mewajibkan approval untuk perintah berisiko.
- Publish menjalankan secret scan dan menonaktifkan hook Git yang tidak tepercaya.
- Local checks dari quality gate juga mewajibkan approval.

## Struktur

```text
src/
  main/        proses utama Electron: agent, DB, provider, tools, keamanan
  preload/     bridge IPC bertipe
  renderer/    UI React
  shared/      tipe, kontrak IPC, util bersama
```

Data aplikasi:

- Database: `app.getPath('userData')/r3x.db`
- Skill terpasang: `app.getPath('userData')/skills`
- Backup: dibuat dari halaman Settings ke direktori userData

## Batasan

- Target packaging saat ini hanya Windows NSIS x64.
- Belum ada code signing dan icon aplikasi kustom.
- Terminal memakai `spawn`, belum memakai PTY.
- Belum ada auto-update.
- Publikasi GitHub memakai OAuth App klasik dengan scope `repo`.
