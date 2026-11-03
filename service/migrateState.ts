import {cpSync,existsSync,mkdirSync,readdirSync,renameSync,rmSync} from 'node:fs'
import path from 'node:path'
import {BRAND,legacyStateDir,serviceStateDir} from './brand'

/**
 * The product used to be OpenHero68, storing settings under
 * %LOCALAPPDATA%/OpenHero68/rgb-service. Renaming the folder silently would
 * drop every saved profile, so copy the old tree across once, before anything
 * reads the new location.
 *
 * Copy then remove rather than rename: the old folder lives beside a running
 * service and a half-finished move must leave the original intact.
 */
export function migrateLegacyStateDir(localAppData = process.env.LOCALAPPDATA ?? process.cwd()){
  const legacy=legacyStateDir(localAppData),current=serviceStateDir(localAppData)
  if(legacy===current||!existsSync(legacy))return
  if(existsSync(current)&&readdirSync(current).length>0)return
  try{
    mkdirSync(current,{recursive:true})
    cpSync(legacy,current,{recursive:true,force:false,errorOnExist:false})
  }catch(error){
    // Leaving both trees in place is the safe failure: the old folder still
    // holds the settings and the next start retries the copy.
    process.stderr.write(`Settings migration from ${BRAND.legacy.dataDir} failed: ${error}\n`)
    return
  }
  try{rmSync(legacy,{recursive:true,force:true})}catch{
    // The copy already succeeded; a locked old folder is harmless.
  }
}
