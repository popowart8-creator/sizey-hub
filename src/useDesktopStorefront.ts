import {useSyncExternalStore} from 'react';
import {platform} from './Navigation';

const query = '(min-width: 960px) and (hover: hover) and (pointer: fine)';

function subscribe(listener: () => void) {
 const media = window.matchMedia(query);
 media.addEventListener('change', listener);
 return () => media.removeEventListener('change', listener);
}

function isDesktopStorefront() {
 return platform()==='web' && window.matchMedia(query).matches;
}

export default function useDesktopStorefront() {
 return useSyncExternalStore(subscribe, isDesktopStorefront);
}
