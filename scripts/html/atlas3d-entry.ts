/**
 * Ponto de entrada do 3D da versão em HTML: a mesma cena do site
 * (src/components/atlas/world3d.ts, com three.js), empacotada pelo esbuild
 * num script clássico — que, ao contrário de um módulo, também carrega
 * quando a página é aberta direto do disco (file://).
 */
import { createWorld3D } from '../../src/components/atlas/world3d'

;(window as unknown as { KaelAtlas3D: { createWorld3D: typeof createWorld3D } }).KaelAtlas3D = { createWorld3D }
