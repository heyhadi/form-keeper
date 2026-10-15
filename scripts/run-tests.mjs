import { spawn } from 'node:child_process';

// Filter out Jest-specific flags like --watchAll that Vitest does not recognize
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--watchAll'));

const child = spawn('npx', ['vitest', 'run', ...args], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
