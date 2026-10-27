import type { Project } from '../../shared/types';
import type { CheckResult } from './checks';

const REQUIRED = [
  '## Masalah', '## Fitur', '## Tech Stack', '## Instalasi', '## Menjalankan',
  '## Environment', '## Test', '## Struktur', '## Troubleshooting', '## Lisensi',
];

export function generateReadme(input: { project: Project; scripts: string[]; checks: CheckResult[] }): string {
  const { project, scripts, checks } = input;
  const isPython = project.stack.some((item) => /python|django|flask|fastapi/i.test(item));
  const isPhp = project.stack.some((item) => /php|laravel|symfony/i.test(item));
  const install = isPython ? 'pip install -r requirements.txt' : isPhp ? 'composer install' : 'npm install';
  const run = isPython ? 'python main.py' : isPhp ? 'php -S localhost:8000' : 'npm run dev';
  return `# ${project.name}

${project.brief.problem}

## Masalah
${project.brief.problem}

Target pengguna: ${project.brief.targetUsers}

## Fitur
${project.brief.mvpFeatures.map((feature) => `- ${feature}`).join('\n')}

## Tech Stack
${project.stack.map((item) => `- ${item}`).join('\n') || '- belum ditentukan'}

## Instalasi
\`\`\`bash
${install}
\`\`\`

## Menjalankan
\`\`\`bash
${run}
\`\`\`

## Environment
Salin \`.env.example\` menjadi \`.env\` dan isi variabel yang dibutuhkan. Jangan commit \`.env\`.

## Test
${scripts.length ? scripts.map((script) => `- \`npm run ${script}\``).join('\n') : 'Belum ada script test.'}

${checks.length ? `Hasil terakhir:\n${checks.map((check) => `- ${check.name}: ${check.ok ? 'lulus' : 'gagal'}`).join('\n')}` : ''}

## Struktur
\`\`\`text
.
├─ src/
└─ README.md
\`\`\`

## Troubleshooting
- Pastikan runtime dan dependency sudah terpasang.
- Periksa variabel environment bila aplikasi gagal start.

## Lisensi
Belum ditentukan. Tambahkan lisensi setelah keputusan pemilik proyek.
`;
}

export function validateReadme(markdown: string): string[] {
  return REQUIRED.filter((heading) => !markdown.includes(heading));
}
