import {ChevronRight} from 'lucide-react';

export function ProfileSkeleton(){
 const row=(key:number)=><div className={'profilerow menu-row sizey-profile-loading-menu-row'+(key===6?' profile-logout':'')} key={key}>
  <span className="sizey-skeleton-bone sizey-profile-loading-icon"/>
  <span className="sizey-skeleton-bone sizey-profile-loading-label"/>
  <ChevronRight size={20} className="sizey-profile-loading-chevron" aria-hidden="true"/>
 </div>;
 return <div className="sizey-profile-loading" role="status" aria-label="Загрузка профиля" aria-busy="true">
  <div className="customerlayout">
   <section className="customerbonus">
    <div className="sizey-card-interactive">
     <div className="sizey-profile-loading-card sizey-skeleton-bone" aria-hidden="true"/>
    </div>
    <p className="sizey-qr-hint" aria-hidden="true"><span className="sizey-skeleton-bone sizey-profile-loading-hint"/></p>
   </section>
  </div>
  <div className="profile-menu-stack">
   <section className="profile-utilities menu-list">{[0,1,2,3,4].map(row)}</section>
   <section className="profile-utilities menu-list profile-account-actions">{[5,6].map(row)}</section>
  </div>
 </div>;
}
export function BonusSkeleton(){return <div className="bonus-skeleton" role="status" aria-label="Загрузка бонусов" aria-busy="true"><span className="shimmer skeleton-balance"/><span className="shimmer skeleton-line medium"/>{[0,1,2].map(i=><div className="skeleton-operation" key={i}><span className="shimmer skeleton-line wide"/><span className="shimmer skeleton-line medium"/></div>)}</div>}
export function ProductSkeleton(){return <div className="product-skeleton" role="status" aria-label="Загрузка описания товара" aria-busy="true"><span className="shimmer skeleton-line wide"/><span className="shimmer skeleton-line wide"/><span className="shimmer skeleton-line medium"/></div>}

export function NotificationListSkeleton(){
 return <div className="native-list-skeleton" role="status" aria-label="Загрузка уведомлений" aria-busy="true">{[0,1,2,3].map(i=><div className="native-skeleton-row" key={i} aria-hidden="true"><span className="sizey-skeleton-bone native-skeleton-title"/><span className="sizey-skeleton-bone native-skeleton-text"/><span className="sizey-skeleton-bone native-skeleton-date"/></div>)}</div>;
}
export function BonusHistorySkeleton(){
 return <div className="native-list-skeleton" role="status" aria-label="Загрузка истории бонусов" aria-busy="true">{[0,1,2,3,4].map(i=><div className="native-skeleton-row native-skeleton-bonus" key={i} aria-hidden="true"><div className="native-skeleton-bonus-details"><span className="sizey-skeleton-bone native-skeleton-title"/><span className="sizey-skeleton-bone native-skeleton-date"/></div><span className="sizey-skeleton-bone native-skeleton-amount"/></div>)}</div>;
}
