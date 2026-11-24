import readline from 'readline';
import dotenv from 'dotenv';
import { createUser } from '../src/services/authService';
import { prisma } from '../src/utils/prisma';

dotenv.config();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const anyRl = rl as any;
      anyRl._writeToOutput = (s: string) => {
        if (s.includes(question)) anyRl.output.write(s);
        else anyRl.output.write('');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = flag('email') || process.env.ADMIN_EMAIL || (await ask('Email: '));
  const password = flag('password') || process.env.ADMIN_PASSWORD || (await ask('Contraseña: ', true));
  if (!email || !password) throw new Error('Email y contraseña son obligatorios');
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  const user = await createUser(email, password);
  console.log(`Usuario creado/actualizado: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
