# Chifres de uma cor

O fundo cinza foi mantido. Cada arquivo usa a mesma cor nos dois chifres; a cor final ainda será escolhida pelo autor.

- `discorja-grafite-azul.png`: Azul.
- `discorja-grafite-vermelho.png`: Vermelho.
- `discorja-grafite-prata.png`: Prata.
- `discorja-grafite-lilas.png`: Lilás da antiga logo, referência #B8A0FF.

[Comparar no Figma](https://www.figma.com/design/YbeCeb5y0429UnVs7tqdCN?node-id=17-47)

São propostas geradas pela ferramenta integrada de edição de imagem, a partir de `discorja-grafite.png`. Pequenas diferenças de traço podem existir. A variação lilás é a base da logo oficial sem fundo usada no aplicativo; `scripts/process-logo.mjs` remove o fundo e amplia a arte dentro do ícone quadrado.

## Instruções usadas na edição

### Lilás da antiga logo

Use case: precise-object-edit. Edit target: the supplied Discorja skull logo on a graphite-gray rounded-square tile. Change ONLY BOTH horns' outer colored faces from silver-gray to the SAME soft purple/lavender #B8A0FF, the signature color of Discorja's former logo and app buttons. Both horns must be purple, one shared hue, no two-color scheme, no mint, no blue or pink horns. Use a nearly flat lavender face with only restrained tonal shading. Preserve the graphite-gray background and its subtle gray-violet shading, near-black outer background, pale skull and its shading, eye sockets, nose, teeth, all contours, proportions, placements and framing. No new geometry, no text, no watermark. Return one clean square logo: faithful recoloring of the input.

### Azul

Use case: precise-object-edit. Input image is the edit target, the Discorja skull logo. Color correction ONLY. The user wants a SINGLE SAME COLOR on BOTH horns, with no two-color scheme. Keep the graphite-gray rounded-square tile and near-black surrounding background EXACTLY as in the input, including its restrained gray-violet shading. Keep all contours, geometry, skull color, eye sockets, nose, teeth, framing, scale and clean vector-like shading. No text, watermark or extra objects. Both horns must visibly match in hue. Use flat consistent hue with only extremely subtle tonal shading, no multicolored gradient. Return one square logo. Recolor BOTH horns' exterior faces to the SAME azure blue #4A8BFF. Both left and right are blue. No pink, lavender, green or silver horns.

### Vermelho

Use case: precise-object-edit. Input image is the edit target, the Discorja skull logo. Color correction ONLY. The user wants a SINGLE SAME COLOR on BOTH horns, with no two-color scheme. Keep the graphite-gray rounded-square tile and near-black surrounding background EXACTLY as in the input, including its restrained gray-violet shading. Keep all contours, geometry, skull color, eye sockets, nose, teeth, framing, scale and clean vector-like shading. No text, watermark or extra objects. Both horns must visibly match in hue. Use flat consistent hue with only extremely subtle tonal shading, no multicolored gradient. Return one square logo. Recolor BOTH horns' exterior faces to the SAME crimson red #E75363. Both left and right are red. No blue, pink, lavender, mint or silver horns.

### Prata

Use case: precise-object-edit. Input image is the edit target, the Discorja skull logo. Color correction ONLY. The user wants a SINGLE SAME COLOR on BOTH horns, with no two-color scheme. Keep the graphite-gray rounded-square tile and near-black surrounding background EXACTLY as in the input, including its restrained gray-violet shading. Keep all contours, geometry, skull color, eye sockets, nose, teeth, framing, scale and clean vector-like shading. No text, watermark or extra objects. Both horns must visibly match in hue. Use flat consistent hue with only extremely subtle tonal shading, no multicolored gradient. Return one square logo. Recolor BOTH horns' exterior faces to the SAME cool silver-gray #AEB7C8. Both left and right are silver-gray. Keep them distinguishable from the pale skull, restrained matte surface, no shiny chrome reflections and no colored horns.
