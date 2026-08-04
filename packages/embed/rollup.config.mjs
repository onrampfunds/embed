import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const input = 'src/index.ts';

const ts = () => typescript({ tsconfig: './tsconfig.build.json' });


/**
 * The library has no dependencies at all, so nothing is ever external. If that stops being true,
 * `check-zero-deps.mjs` fails the build before anything reaches npm.
 */
export default [
  {
    input,
    output: [
      { file: 'dist/index.mjs', format: 'es', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true, exports: 'named' },
    ],
    plugins: [ts()],
  },
  {
    // The CDN build. Minified, because this one is loaded straight into a partner's page and
    // costs them real Core Web Vitals.
    input,
    output: {
      file: 'dist/onramp-embed.umd.js',
      format: 'umd',
      name: 'Onramp',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      ts(),
      terser({
        format: { comments: false },
        compress: { passes: 2 },
      }),
    ],
  },
  {
    input,
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts()],
  },
];
