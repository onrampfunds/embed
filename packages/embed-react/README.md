# @onrampfunds/embed-react

React wrapper for [`@onrampfunds/embed`](https://github.com/onrampfunds/embed/tree/main/packages/embed).

> **This `0.0.1` is a placeholder.** It exists to reserve the package name and to prove the release
> pipeline publishes both packages together, before anyone depends on either. The component itself
> is not here yet — it lands in **CTO-344**.

## Until then

The core library is already a two-line integration in React. There is no need to wait for the
wrapper:

```tsx
import { useEffect, useRef } from 'react';
import { mount, type MountConfig } from '@onrampfunds/embed';

export function CapitalCard({ config }: { config: MountConfig }) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (slot.current === null) return;
    const card = mount(slot.current, config);
    return () => card?.unmount();
  }, [config]);

  return <div ref={slot} />;
}
```

Two things to know, both of which the wrapper will handle for you:

- **Memoise `config`,** or pass a stable reference. An object literal is a new value on every
  render, so the effect would tear the card down and rebuild it each time.
- **Strict mode double-invokes effects** in development. The cleanup above handles it, and the core
  library also replaces any card it finds already mounted in the same element rather than stacking
  a second one.

## Versioning

This package and `@onrampfunds/embed` publish at the same version from the same release, and this
one depends on that exact version — never a range. You never have to work out which wrapper pairs
with which core.

## License

[MIT](LICENSE).

**Trademark.** The MIT licence covers the code. It does not grant any right to use the Onramp Funds
name, logo, or other trademarks, or to access the Onramp Funds API or services.
