import os from 'node:os'
import path from 'node:path'

export function winglineHome(env: NodeJS.ProcessEnv = process.env, homedir: string = os.homedir()): string {
  return env.WINGLINE_HOME || path.join(homedir, '.wingline')
}
