import fs from 'fs';
import { prisma } from '../src/utils/prisma';
import { bookService } from '../src/services/bookService';

async function main() {
  const lang = await prisma.language.findFirst({ where: { name: 'Français' } });
  if (!lang) throw new Error('Language Français not found');
  const book = await bookService.createFromUpload({
    languageId: lang.id,
    buffer: fs.readFileSync('/Users/federicohappyrobot/Downloads/Flaubert-Bovary.pdf'),
    filename: 'Flaubert-Bovary.pdf', mimetype: 'application/pdf',
    title: 'Madame Bovary (nuevo)', author: 'Gustave Flaubert',
  });
  const full: any = await bookService.getBook(book.id);
  console.log('id', book.id, 'totalPages', full?.totalPages, 'totalWords', full?.totalWords);
  console.log(JSON.stringify(full?.chapters));
}
main().finally(() => prisma.$disconnect());
