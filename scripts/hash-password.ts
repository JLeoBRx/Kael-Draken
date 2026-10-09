import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { hashPassword } from '../src/lib/auth/password'

async function main() {
  let password = process.argv[2]
  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout })
    password = await rl.question('Senha do painel (mínimo de 12 caracteres): ')
    rl.close()
  }
  if (!password || password.length < 12) {
    console.error('A senha precisa ter pelo menos 12 caracteres.')
    process.exit(1)
  }
  const hash = await hashPassword(password)
  console.log('\nAdicione ao seu .env.local:\n')
  console.log(`ADMIN_PASSWORD_HASH=${hash}`)
}

main()
