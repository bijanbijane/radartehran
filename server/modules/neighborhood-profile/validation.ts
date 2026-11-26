import { NIPS_DOMAIN_IDS, type NipsDomainId, type NipsDomainState, type NipsMetric, type NipsNeighborhoodProfile, type NipsProfileQuality } from './types';
export type NipsProfileValidationCode = 'INVALID_PROFILE_ID'|'INVALID_PROFILE_VERSION'|'INVALID_TIMESTAMP'|'INVALID_DOMAIN_SET'|'INVALID_DOMAIN_STATE'|'INVALID_READINESS_COUNT'|'INVALID_METRIC_ID'|'INVALID_METRIC_STATE_VALUE'|'INVALID_METRIC_NULL_SEMANTICS'|'INVALID_METRIC_PERIOD'|'INVALID_METRIC_GEO_REFERENCE'|'INVALID_METRIC_PROVENANCE'|'INVALID_METRIC_QUALITY'|'INVALID_QUALITY_SUMMARY'|'INVALID_JSON_VALUE'|'PUBLICATION_POLICY_VIOLATION';
export interface NipsProfileValidationIssue { readonly code:NipsProfileValidationCode; readonly path:string; readonly message:string; }
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const HASH=/^[a-f0-9]{64}$/i;
const count=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export interface NipsPublicationPolicy {
 readonly productKey:string;
 readonly audience:'PUBLIC'|'INTERNAL'|'RESTRICTED';
 readonly version:string;
 readonly requiredDomains:readonly NipsDomainId[];
 readonly allowedStatesByDomain:Partial<Readonly<Record<NipsDomainId,readonly NipsDomainState[]>>>;
 readonly maxBlockedMetrics:number;
 readonly minimumPublishableMetricsByRequiredDomain?:Partial<Readonly<Record<NipsDomainId,number>>>;
}
export const NIPS_DEFAULT_PUBLICATION_POLICY: NipsPublicationPolicy = {
 productKey:'neighborhood-profile',
 audience:'PUBLIC',
 version:'1.0.0',
 requiredDomains:['identity','geography','evidence'],
 allowedStatesByDomain:{
  identity:['READY'],
  geography:['READY'],
  evidence:['READY'],
  demographics:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  socioeconomic:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  real_estate:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  building_stock:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  land_use:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  infrastructure:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  mobility:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  environment:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  safety:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  history:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
  intelligence:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE'],
 },
 maxBlockedMetrics:0,
};
function isJsonValue(value:unknown, seen=new Set<object>()):boolean {
 if(value===null||typeof value==='string'||typeof value==='boolean') return true;
 if(typeof value==='number') return Number.isFinite(value);
 if(typeof value!=='object') return false;
 if(seen.has(value)) return false;
 seen.add(value);
 let valid:boolean;
 if(Array.isArray(value)) valid=value.every((item)=>isJsonValue(item,seen));
 else {
  const proto=Object.getPrototypeOf(value);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const hasOnlyDataProperties=Reflect.ownKeys(descriptors).every((key)=>typeof key==='string'&&'value' in descriptors[key]);
  valid=(proto===Object.prototype||proto===null)&&hasOnlyDataProperties&&Object.values(descriptors).every((descriptor)=>isJsonValue(descriptor.value,seen));
 }
 seen.delete(value);
 return valid;
}
export function validateNipsPublicationPolicy(profile:NipsNeighborhoodProfile,policy:NipsPublicationPolicy=NIPS_DEFAULT_PUBLICATION_POLICY):readonly NipsProfileValidationIssue[] {
 const issues:NipsProfileValidationIssue[]=[];
 const policyDomains=policy.requiredDomains;
 const uniqueRequiredDomains=new Set(policyDomains);
 if(typeof policy.version!=='string'||!policy.version.trim()||typeof policy.productKey!=='string'||!policy.productKey.trim()||
    !['PUBLIC','INTERNAL','RESTRICTED'].includes(policy.audience)||!Number.isSafeInteger(policy.maxBlockedMetrics)||policy.maxBlockedMetrics<0||
    uniqueRequiredDomains.size!==policyDomains.length||policyDomains.some((id)=>!NIPS_DOMAIN_IDS.includes(id)))
  issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'publicationPolicy',message:'نسخه، محصول، مخاطب، دامنه‌های الزامی یا سقف شاخص‌های مسدود در سیاست انتشار معتبر نیست.'});
 for(const [domainId,states] of Object.entries(policy.allowedStatesByDomain)) {
  if(!NIPS_DOMAIN_IDS.includes(domainId as NipsDomainId)||!Array.isArray(states)||states.some((state)=>!['READY','PARTIAL','STALE','BLOCKED','UNAVAILABLE','NOT_APPLICABLE'].includes(state)))
   issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'publicationPolicy.allowedStatesByDomain.'+domainId,message:'فهرست وضعیت‌های مجاز در سیاست انتشار معتبر نیست.'});
 }
 for(const [domainId,minimum] of Object.entries(policy.minimumPublishableMetricsByRequiredDomain??{})) {
  if(!NIPS_DOMAIN_IDS.includes(domainId as NipsDomainId)||!Number.isSafeInteger(minimum)||minimum<0)
   issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'publicationPolicy.minimumPublishableMetricsByRequiredDomain.'+domainId,message:'حداقل تعداد شاخص‌های قابل انتشار معتبر نیست.'});
 }
 const envelopes={identity:profile.identity,...profile.domains} as unknown as Record<NipsDomainId,{state:NipsDomainState;readiness:{blockedMetricCount:number;publishableMetricCount:number}}>;
 for(const domainId of NIPS_DOMAIN_IDS) {
  const envelope=envelopes[domainId];
  const allowed=policy.allowedStatesByDomain[domainId]??(policy.requiredDomains.includes(domainId)?['READY']:['READY','PARTIAL','UNAVAILABLE','NOT_APPLICABLE']);
  if(!allowed.includes(envelope.state))
   issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'domains.'+domainId+'.state',message:'وضعیت دامنه با سیاست انتشار این محصول سازگار نیست.'});
  if(envelope.readiness.blockedMetricCount>policy.maxBlockedMetrics)
   issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'domains.'+domainId+'.readiness.blockedMetricCount',message:'تعداد شاخص‌های مسدود از سقف مجاز سیاست انتشار بیشتر است.'});
  if(policy.requiredDomains.includes(domainId)) {
   const minimum=policy.minimumPublishableMetricsByRequiredDomain?.[domainId]??0;
   if(envelope.readiness.publishableMetricCount<minimum)
    issues.push({code:'PUBLICATION_POLICY_VIOLATION',path:'domains.'+domainId+'.readiness.publishableMetricCount',message:'تعداد شاخص‌های قابل انتشار در دامنه الزامی کمتر از حد سیاست است.'});
  }
 }
 return issues;
}

const iso=(s:string)=>ISO.test(s)&&Number.isFinite(Date.parse(s));
function validateMetric(m:NipsMetric,path:string,out:NipsProfileValidationIssue[]):void {
 if(!m.metricId.trim()) out.push({code:'INVALID_METRIC_ID',path:path+'.metricId',message:'شناسه شاخص خالی است.'});
 if(!isJsonValue(m.value)) out.push({code:'INVALID_JSON_VALUE',path:path+'.value',message:'مقدار شاخص باید JSON معتبر و بدون عدد غیرمتناهی، تابع، تاریخ یا مرجع دوری باشد.'});
 if(m.state==='OBSERVED'&&m.value===null) out.push({code:'INVALID_METRIC_STATE_VALUE',path:path+'.value',message:'شاخص مشاهده‌شده نمی‌تواند null باشد.'});
 if(['MISSING','UNAVAILABLE','SUPPRESSED','NOT_APPLICABLE'].includes(m.state)&&m.value!==null) out.push({code:'INVALID_METRIC_NULL_SEMANTICS',path:path+'.value',message:'برای این وضعیت مقدار باید null باشد؛ صفر فقط مقدار مشاهده‌شده است.'});
 if(!iso(m.period.observedAt)) out.push({code:'INVALID_METRIC_PERIOD',path:path+'.period.observedAt',message:'زمان مشاهده باید ISO-8601 معتبر باشد.'});
 for(const date of [m.period.periodStart,m.period.periodEnd,m.period.asOf]) if(date!==null&&!iso(date)) out.push({code:'INVALID_METRIC_PERIOD',path:path+'.period',message:'تاریخ‌های دوره باید ISO-8601 معتبر باشند.'});
 if(m.period.periodStart&&m.period.periodEnd&&Date.parse(m.period.periodStart)>Date.parse(m.period.periodEnd)) out.push({code:'INVALID_METRIC_PERIOD',path:path+'.period',message:'شروع دوره بعد از پایان دوره است.'});
 if(m.geography.level==='NEIGHBORHOOD'&&!m.geography.canonicalEntityId) out.push({code:'INVALID_METRIC_GEO_REFERENCE',path:path+'.geography',message:'شاخص سطح محله باید شناسه کانونیک داشته باشد.'});
 if(!m.methodologyId.trim()||!m.methodologyVersion.trim()) out.push({code:'INVALID_METRIC_PROVENANCE',path:path+'.methodologyId',message:'روش محاسبه و نسخه آن الزامی است.'});
 if(!m.provenance.evidence.length&&!['MISSING','UNAVAILABLE','NOT_APPLICABLE'].includes(m.state)) out.push({code:'INVALID_METRIC_PROVENANCE',path:path+'.provenance.evidence',message:'شاخص دارای مقدار باید مرجع شاهد داشته باشد.'});
 for(const e of m.provenance.evidence) if(!e.evidenceId.trim()||!HASH.test(e.evidenceHash)) out.push({code:'INVALID_METRIC_PROVENANCE',path:path+'.provenance.evidence',message:'شناسه یا هش شاهد معتبر نیست.'});
 const q=m.quality;
 if((q.confidence!==null&&(q.confidence<0||q.confidence>1))||(q.coverageRatio!==null&&(q.coverageRatio<0||q.coverageRatio>1))||(q.sampleSize!==null&&!count(q.sampleSize))) out.push({code:'INVALID_METRIC_QUALITY',path:path+'.quality',message:'مقادیر کیفیت خارج از دامنه معتبر هستند.'});
}
export function validateNipsNeighborhoodProfile(profile:NipsNeighborhoodProfile,policy:NipsPublicationPolicy=NIPS_DEFAULT_PUBLICATION_POLICY):readonly NipsProfileValidationIssue[] {
 const out:NipsProfileValidationIssue[]=[];
 if(!profile.metadata.profileId.trim()) out.push({code:'INVALID_PROFILE_ID',path:'metadata.profileId',message:'شناسه پروفایل الزامی است.'});
 if(!Number.isSafeInteger(profile.metadata.profileVersion)||profile.metadata.profileVersion<1) out.push({code:'INVALID_PROFILE_VERSION',path:'metadata.profileVersion',message:'نسخه پروفایل باید عدد صحیح مثبت باشد.'});
 for(const ts of [profile.metadata.createdAt,profile.metadata.assembledAt]) if(!iso(ts)) out.push({code:'INVALID_TIMESTAMP',path:'metadata',message:'زمان‌های پروفایل باید ISO-8601 معتبر باشند.'});
 if(profile.metadata.publishedAt!==null&&!iso(profile.metadata.publishedAt)) out.push({code:'INVALID_TIMESTAMP',path:'metadata.publishedAt',message:'زمان انتشار معتبر نیست.'});
 const actual=Object.keys(profile.domains); const expected=NIPS_DOMAIN_IDS.filter((id)=>id!=='identity');
 if(actual.length!==expected.length||expected.some((id)=>!actual.includes(id))) out.push({code:'INVALID_DOMAIN_SET',path:'domains',message:'مجموعه دامنه‌ها باید دقیقاً با کاتالوگ نسخه جاری منطبق باشد.'});
 const envelopes=[profile.identity,...Object.values(profile.domains)];
 if(profile.identity.domainId!=='identity') out.push({code:'INVALID_DOMAIN_SET',path:'identity.domainId',message:'بخش هویت باید domainId برابر identity داشته باشد.'});
 for(const [key,env] of Object.entries(profile.domains)) {
  if(env.domainId!==key) out.push({code:'INVALID_DOMAIN_SET',path:'domains.'+key+'.domainId',message:'شناسه دامنه با کلید آن در پروفایل یکسان نیست.'});
 }
 for(const env of envelopes) {
  if(!['READY','PARTIAL','STALE','BLOCKED','UNAVAILABLE','NOT_APPLICABLE'].includes(env.state)) out.push({code:'INVALID_DOMAIN_STATE',path:'domains.'+env.domainId+'.state',message:'وضعیت دامنه معتبر نیست.'});
  const r=env.readiness;
  if(![r.publishableMetricCount,r.blockedMetricCount,r.staleMetricCount,r.unavailableMetricCount].every(count)) out.push({code:'INVALID_READINESS_COUNT',path:'domains.'+env.domainId+'.readiness',message:'شمارنده‌ها باید اعداد صحیح نامنفی باشند.'});
  env.metrics.forEach((m,i)=>validateMetric(m,'domains.'+env.domainId+'.metrics['+i+']',out));
 }
 const q:NipsProfileQuality=profile.quality;
 if(![q.domainCount,q.readyDomainCount,q.partialDomainCount,q.blockedDomainCount,q.staleDomainCount,q.publishableMetricCount,q.blockedMetricCount,q.unavailableMetricCount].every(count)||q.domainCount!==NIPS_DOMAIN_IDS.length) out.push({code:'INVALID_QUALITY_SUMMARY',path:'quality',message:'خلاصه کیفیت با تعداد دامنه‌ها یا شمارنده‌های معتبر سازگار نیست.'});
 if(profile.metadata.publicationState==='PUBLISHED'&&profile.metadata.publishedAt===null) out.push({code:'INVALID_QUALITY_SUMMARY',path:'metadata.publishedAt',message:'پروفایل منتشرشده باید زمان انتشار داشته باشد.'});
 if(profile.metadata.publicationState==='PUBLISHED'&&actual.length===expected.length&&expected.every((id)=>Object.prototype.hasOwnProperty.call(profile.domains,id))) out.push(...validateNipsPublicationPolicy(profile,policy));
 return out;
}
