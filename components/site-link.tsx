"use client";
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

type SiteLinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: false;
};

// vinext's production next/link chunk loses its dynamic navigation export.
// The public router's static import keeps navigation within the shared layout.
export default function SiteLink({ href, replace = false, scroll = true, prefetch: _prefetch, onClick, ...props }: SiteLinkProps) {
  const router = useRouter();
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    const anchor = event.currentTarget;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin || !['http:', 'https:'].includes(destination.protocol)) return;
    event.preventDefault();
    const path = `${destination.pathname}${destination.search}${destination.hash}`;
    if (replace) router.replace(path, { scroll });
    else router.push(path, { scroll });
  }}/>;
}
