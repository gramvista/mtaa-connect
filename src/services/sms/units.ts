const gsm=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extended=new Set(Array.from('^{}\\[~]|€\f'));
export function smsUnits(message:string){
 let units=0;
 for(const char of message){if(gsm.has(char))units++;else if(extended.has(char))units+=2;else return message.length<=70?1:Math.ceil(message.length/67);}
 return units<=160?1:Math.ceil(units/153);
}
