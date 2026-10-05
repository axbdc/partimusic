# Partimusic

Partituras interativas para **violino** e **saxofone alto**: nome de cada nota por baixo, som real, cursor sincronizado, acompanhamento de piano, controlo de velocidade, loop, transposição e avaliação pelo microfone.

## Funcionalidades

- Biblioteca com filtros (instrumento, nível, estilo), pesquisa, favoritos e "continuar onde paraste"
- Leitor de partituras (OpenSheetMusicDisplay) com:
  - nomes das notas por baixo (Dó Ré Mi ou C D E, com ou sem oitava), notas coloridas
  - violino: corda + dedo em 1.ª posição e diagrama do braço
  - sax alto: nota escrita vs. nota real (Mi♭) e diagrama de dedilhação
  - som com amostras reais (violino, sax, piano), velocidade 25–150% sem mudar a afinação
  - loop A–B, metrónomo, contagem antes de começar, transposição ±6 meios-tons
  - "Tocar a minha parte" desligável para tocar só com o acompanhamento
  - clicar numa nota para começar daí, ecrã inteiro, virar página com pedal Bluetooth (setas/PageDown)
- Microfone: afinador, **Avaliar-me** (pinta as notas de verde/vermelho e dá percentagem) e **Modo espera** (só avança quando acertas)
- Progresso: minutos por dia, sequência de dias, melhores avaliações
- Área de admin (`/admin`): upload de PDF e/ou MusicXML (.musicxml/.xml/.mxl), escolha da parte do solista, estados *à espera de conversão / rascunho / publicada*

## Desenvolvimento

```bash
npm install
npm run dev
```

Sem Supabase a app funciona em **modo local** (o admin guarda no IndexedDB do browser).

## Supabase (necessário para o admin guardar online)

1. Criar projeto em supabase.com
2. SQL Editor → correr `supabase/schema.sql`
3. Authentication → Users → criar o teu utilizador; depois correr o `insert into public.admins …` do fim do ficheiro
4. Na Vercel (Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Redeploy

## PDF → MusicXML

Os PDFs carregados ficam *à espera de conversão*. A conversão (OMR) faz-se com o [Audiveris](https://github.com/Audiveris/audiveris) e revisão no MuseScore; ver `scripts/omr/README.md`.

## Partituras de exemplo

`scripts/generate_seed_scores.py` gera 6 obras de domínio público (12 ficheiros) em `public/scores/`.

## Créditos

Amostras: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (CC-BY 3.0). Renderização: OpenSheetMusicDisplay (BSD-3).
