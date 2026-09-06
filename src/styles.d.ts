/** esbuild 以 text loader 打包 styles.css（见 esbuild.config.mjs），这里补类型。 */
declare module "*.css" {
  const css: string;
  export default css;
}
