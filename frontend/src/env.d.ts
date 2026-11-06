declare module "plotly.js-dist-min" {
  import * as Plotly from "plotly.js";
  export = Plotly;
}
declare module "*.css";
declare module "*.svg" {
  const content: string;
  export default content;
}
