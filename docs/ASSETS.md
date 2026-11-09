# Origem dos recursos visuais

> **Registro histórico das fotografias.** As cinco fotografias abaixo foram removidas do projeto na conversão para a aplicação live e não são publicadas no artefato atual. A relação de fontes permanece válida para as famílias tipográficas servidas localmente. Estado atual: [LIVE_RELEASE.md](LIVE_RELEASE.md).

Recursos baixados em 6 de novembro de 2026 e servidos localmente, sem dependência de uma CDN durante a navegação. As imagens foram abertas e inspecionadas para verificar que são fotografias de relógios. Não houve geração de relógios ou alteração de marcas nas fotografias.

## Fotografias

| Arquivo                           | Descrição visual                                               | URL de origem                                                                                                                                          | Dimensões   |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `public/images/hero-watch.jpg`    | Relógio de aço com mostrador preto, sobre um livro             | [Unsplash CDN — photo-1547996160-81dfa63595aa](https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=1800&h=1200&q=88)      | 1800 × 1200 |
| `public/images/watch-detail.jpg`  | Macro de mostrador claro IWC com pulseira de couro             | [Unsplash CDN — photo-1524805444758-089113d48a6d](https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1200&h=900&q=85) | 1200 × 900  |
| `public/images/watch-vintage.jpg` | Cronógrafo Tissot junto a tecido azul                          | [Unsplash CDN — photo-1522312346375-d1a52e2b99b3](https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=1000&h=800&q=85) | 1000 × 800  |
| `public/images/watch-field.jpg`   | Cronógrafo Fossil em fundo claro                               | [Unsplash CDN — photo-1542496658-e33a6d0d50f6](https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=1000&h=800&q=85)       | 1000 × 800  |
| `public/images/watch-diver.jpg`   | Relógio de mostrador preto e pulseira de tecido, sobre madeira | [Unsplash CDN — photo-1508057198894-247b23fe5ade](https://images.unsplash.com/photo-1508057198894-247b23fe5ade?auto=format&fit=crop&w=1000&h=800&q=85) | 1000 × 800  |

As fotografias são utilizadas como ilustrações editoriais de demonstração sob a [licença Unsplash](https://unsplash.com/license), consultada na data acima. Essa licença permite baixar, copiar e usar imagens, inclusive comercialmente, e veda a revenda da imagem sem modificação significativa e a compilação para replicar um serviço concorrente. Ela não estabelece vínculo com fabricantes nem constitui licença de uso de marcas para sugerir patrocínio. Os nomes dos fotógrafos não foram confirmados nos metadados desta coleta; não foi atribuída autoria sem evidência.

Os nomes `vintage`, `field` e `diver` são identificadores de layout, não classificações técnicas dos exemplares fotografados. As imagens não comprovam período, calibre, referência exata, autenticidade ou propriedade. Quando usadas junto a uma referência de catálogo distinta, a interface deve identificá-las como ilustrativas. Para lançamento editorial, é preferível substituir os exemplos por fotografias próprias/autorizadas com ficha de crédito e correspondência exata à referência.

## Fontes

| Arquivo                               | Família e uso                                   | Origem                                                             |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `dm-sans-latin.woff2`                 | DM Sans, sans-serif variável, texto e navegação | [Google Fonts](https://fonts.google.com/specimen/DM+Sans)          |
| `instrument-serif-latin.woff2`        | Instrument Serif, títulos, regular              | [Google Fonts](https://fonts.google.com/specimen/Instrument+Serif) |
| `instrument-serif-italic-latin.woff2` | Instrument Serif, destaque editorial em itálico | [Google Fonts](https://fonts.google.com/specimen/Instrument+Serif) |

Os arquivos WOFF2 vêm das URLs `fonts.gstatic.com` declaradas na folha CSS do Google Fonts. O subconjunto latino inclui os caracteres acentuados comuns ao português. As famílias são distribuídas sob SIL Open Font License; os textos estão junto aos arquivos em `public/fonts/DM-Sans-OFL.txt` e `public/fonts/Instrument-Serif-OFL.txt`. Não é necessário contatar Google Fonts em runtime.
