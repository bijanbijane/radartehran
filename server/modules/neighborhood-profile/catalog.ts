import { NIPS_DOMAIN_IDS, type NipsDomainId } from './types';
export interface NipsDomainDefinition { readonly id: NipsDomainId; readonly titleFa: string; readonly titleEn: string; readonly description: string; readonly requiredForIdentity: boolean; readonly publishIndependently: boolean; }
export const NIPS_DOMAIN_CATALOG: readonly NipsDomainDefinition[] = [
{ id:'identity',titleFa:'هویت و شناسنامه',titleEn:'Identity',description:'هویت کانونیک، نام‌ها، سلسله‌مراتب اداری و نگاشت شناسه‌های قدیمی.',requiredForIdentity:true,publishIndependently:true },
{ id:'geography',titleFa:'جغرافیا و ساختار فضایی',titleEn:'Geography',description:'مرکز، مرز نسخه‌دار، مساحت مجاز و قابلیت‌های تحلیل مکانی.',requiredForIdentity:true,publishIndependently:true },
{ id:'demographics',titleFa:'جمعیت و ساختار جمعیتی',titleEn:'Demographics',description:'جمعیت، خانوار، توزیع‌های جمعیتی، مهاجرت و برآوردها.',requiredForIdentity:false,publishIndependently:true },
{ id:'socioeconomic',titleFa:'ساختار اجتماعی و اقتصادی',titleEn:'Socioeconomic',description:'درآمد، اشتغال، فعالیت اقتصادی، محرومیت و اقتصاد خانوار.',requiredForIdentity:false,publishIndependently:true },
{ id:'real_estate',titleFa:'بازار املاک و مستغلات',titleEn:'Real Estate',description:'فروش، اجاره، ودیعه، معاملات قطعی، عرضه، تقاضا و ارزش‌گذاری.',requiredForIdentity:false,publishIndependently:true },
{ id:'building_stock',titleFa:'کالبد و موجودی ساختمان',titleEn:'Building Stock',description:'تعداد، سن، طبقات، تیپ، وضعیت سازه، اشغال و نوسازی.',requiredForIdentity:false,publishIndependently:true },
{ id:'land_use',titleFa:'کاربری زمین و فرم شهری',titleEn:'Land Use',description:'طبقه‌بندی کاربری، مساحت طبقات و نسبت‌های پوشش و زیربنا.',requiredForIdentity:false,publishIndependently:true },
{ id:'infrastructure',titleFa:'خدمات و زیرساخت شهری',titleEn:'Infrastructure',description:'آموزش، سلامت، پارک، خدمات عمومی، تأسیسات و اتصال دیجیتال.',requiredForIdentity:false,publishIndependently:true },
{ id:'mobility',titleFa:'حمل‌ونقل و دسترسی',titleEn:'Mobility',description:'شبکه، حمل‌ونقل عمومی، ترافیک، پیاده‌پذیری و زمان سفر.',requiredForIdentity:false,publishIndependently:true },
{ id:'environment',titleFa:'محیط‌زیست و اقلیم',titleEn:'Environment',description:'هوا، صدا، اقلیم، فضای سبز، آب، پسماند و ریسک محیطی.',requiredForIdentity:false,publishIndependently:true },
{ id:'safety',titleFa:'امنیت و مخاطرات',titleEn:'Safety',description:'جرم تجمیعی، تصادف، پاسخ اضطراری و مخاطرات طبیعی و زیرساختی.',requiredForIdentity:false,publishIndependently:true },
{ id:'history',titleFa:'تاریخچه و تحولات محله',titleEn:'History',description:'رویدادها، پروژه‌ها، تغییرات مرز، کاربری، جمعیت و بازار.',requiredForIdentity:false,publishIndependently:true },
{ id:'intelligence',titleFa:'شاخص‌ها و تحلیل هوشمند',titleEn:'Intelligence',description:'شاخص‌های ترکیبی، رتبه‌بندی، پیش‌بینی و ارزیابی ریسک با نسخه مدل.',requiredForIdentity:false,publishIndependently:true },
{ id:'evidence',titleFa:'منابع، شواهد و منشأ داده',titleEn:'Evidence & Provenance',description:'نسخه رجیستری‌ها، مجوزها، پوشش منابع و تعارض‌های حل‌نشده.',requiredForIdentity:true,publishIndependently:true },
] as const;
export function isNipsDomainId(value:string):value is NipsDomainId { return (NIPS_DOMAIN_IDS as readonly string[]).includes(value); }
export function getNipsDomainDefinition(id:NipsDomainId):NipsDomainDefinition {
 const item=NIPS_DOMAIN_CATALOG.find((entry)=>entry.id===id);
 if(!item) throw new Error(`NIPS_DOMAIN_NOT_REGISTERED:${id}`);
 return item;
}
