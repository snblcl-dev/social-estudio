import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = getArg("--email")?.trim();
  const password = getArg("--password");
  const name = getArg("--name")?.trim() || email?.split("@")[0] || "Usuario";

  if (!email || !password) {
    console.error(
      'Uso: npm run create-user -- --email tu@email.com --password "tu-clave" [--name "Tu nombre"]',
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Ya existe un usuario con el email ${email}.`);
    process.exit(1);
  }

  const id = randomUUID();
  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      id,
      name,
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  console.log(`Usuario creado: ${email} (id: ${id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
