import { forwardRef, type AnchorHTMLAttributes } from 'react';

/** Public static pages use native links; browser persistence survives navigation. */
const Link = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>(function PreviewLink({ href, ...props }, ref) {
  return <a {...props} href={href} ref={ref} />;
});
export default Link;
