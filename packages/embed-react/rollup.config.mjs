import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const input = 'src/index.ts';

/** The core and React stay external — this package bundles neither. */
const external = ['@onrampfunds/embed', 'react', 'react/jsx-runtime'];

export default [
  {
    input,
    external,
    output: [
      { file: 'dist/index.mjs', format: 'es', sourcemap: true, sourcemapExcludeSources: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true, sourcemapExcludeSources: true, exports: 'named' },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
  },
  {
    input,
    external,
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts()],
  },
];
