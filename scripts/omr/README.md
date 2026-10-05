# Conversão PDF → MusicXML (OMR)

1. Descarregar os PDFs pendentes no admin (botão **PDF**).
2. Converter com o Audiveris (linha de comandos):

   ```bash
   audiveris -batch -export -output ./out partitura.pdf
   # gera out/partitura.mxl
   ```

   ou abrir o PDF na app do Audiveris → *Book → Transcribe* → *Export as MusicXML*.
3. Abrir o `.mxl` no MuseScore, comparar com o PDF e corrigir notas, ligaduras e armaduras.
   - Sax alto: garantir que a parte é "Alto Saxophone" (transposição Mi♭) e que a partitura está em som escrito.
4. Exportar como MusicXML (`.mxl` ou `.musicxml`).
5. No admin: **Editar** → juntar o ficheiro → estado **Publicada** → Guardar.

Partituras digitais limpas (exportadas de editores) convertem quase sem erros; digitalizações de papel precisam de mais revisão.
