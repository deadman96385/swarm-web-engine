export const INSTALL_SUGGESTION_DISMISS_MS=30*24*60*60*1000;

export function detectInstallSuggestionPlatform(navigatorLike={}){
  const userAgent=navigatorLike.userAgent??'',platform=navigatorLike.platform??'',touchPoints=Number(navigatorLike.maxTouchPoints??0);
  const ios=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1);
  if(ios)return/CriOS/i.test(userAgent)?'ios-chrome':'ios';
  if(/Android/i.test(userAgent))return'android';
  const mac=/Mac/i.test(platform)||/Macintosh/i.test(userAgent),safari=navigatorLike.vendor==='Apple Computer, Inc.'&&/Safari/i.test(userAgent)&&!/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
  return mac&&safari?'mac':null;
}

export function installSuggestionDismissKey(platform){return`swarm-web-${platform}-install-dismissed-v1`;}

export function hasExportableProgress(save,profileData={}){return!!save||Object.keys(profileData.scores??{}).length>0||(profileData.achievements?.length??0)>0;}

export function installSuggestionDismissalActive(value,now=Date.now()){
  const dismissedAt=Number(value);
  return Number.isFinite(dismissedAt)&&dismissedAt>0&&now-dismissedAt<INSTALL_SUGGESTION_DISMISS_MS;
}
