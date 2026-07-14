export const ARCHIVE_AUDIO_FILES={
  menu:'MenuButton.wav',blaster:'BlasterShot.wav',laser:'LaserShot3.wav',laserbeam:'LaserBeam.wav',missile:'Missile.wav',photon:'Photon.wav',
  enemy:'David_EnemyPop.wav',life:'DeepThrob.wav',powerdown:'PowerDown.wav',
  countdown1:'Countdown_FemaleComputer_01.wav',countdown2:'Countdown_FemaleComputer_02.wav',countdown3:'Countdown_FemaleComputer_03.wav',
  countdown4:'Countdown_FemaleComputer_04.wav',countdown5:'Countdown_FemaleComputer_05.wav',countdown6:'Countdown_FemaleComputer_06.wav',
  countdown7:'Countdown_FemaleComputer_07.wav',countdown8:'Countdown_FemaleComputer_08.wav',countdown9:'Countdown_FemaleComputer_09.wav',countdown10:'Countdown_FemaleComputer_10.wav'
};

export class AudioBank{
  constructor(urls){this.urls=urls;this.lastPlayed=new Map();this.enabled=true;}
  static fromBlobs(blobs){
    const urls=new Map(Object.entries(blobs??{}).map(([key,blob])=>[key,URL.createObjectURL(blob)]));
    return urls.size?new AudioBank(urls):null;
  }
  static async fromArchive(archive){
    if(!archive)return null;const blobs={};
    await Promise.all(Object.entries(ARCHIVE_AUDIO_FILES).map(async([key,file])=>{const name=archive.names.find(n=>n.toLowerCase().endsWith('/'+file.toLowerCase()));if(name)blobs[key]=new Blob([await archive.bytes(name)],{type:'audio/wav'});}));
    return AudioBank.fromBlobs(blobs);
  }
  play(key){const url=this.urls.get(key);if(!this.enabled||!url)return;const now=performance.now(),gap=key==='enemy'?45:key==='blaster'?60:100;if(now-(this.lastPlayed.get(key)??-Infinity)<gap)return;this.lastPlayed.set(key,now);const audio=new Audio(url);audio.volume=key==='menu'?.28:.38;audio.play().catch(()=>{});}
  dispose(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();}
}
