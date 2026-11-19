export type Product={id:number;name:string;price:number;img:string;gallery:string[];categories:string[];sizes:string[];description:string;tag?:string;published:boolean;version:number;updated:number;sizeKnown:boolean;url:string};
export type Banner={id:string;title:string;image:string;tone:string;category:string;position:number;published:boolean;version:number;updated:number};
export type Choice={value:string;used:number;banners:number};
export type Choices={revision:number;categories:Choice[];sizes:Choice[]};
export type ChoiceKind='categories'|'sizes';
export type AdminRequest=<T>(path:string,data?:unknown)=>Promise<T>;
export type OptionResponse={options:Choices;selected?:string;affectedProducts:number;affectedBanners:number};
