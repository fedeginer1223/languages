import express from 'express';
import { AddressInfo } from 'net';
process.env.EXTERNAL_API_KEY = 'test-key';
import { requireApiKey } from '../src/middleware/apiKey';
import { extRouter } from '../src/routes/ext';
import { errorHandler } from '../src/middleware/errorHandler';
import { prisma } from '../src/utils/prisma';

const TOPIC = '__ext_smoke__';
const TERMS = ['__zz_smoke_un__', '__zz_smoke_deux__'];

async function main() {
  const fr = await prisma.language.findFirst({ where: { code: { equals: 'fr', mode: 'insensitive' } } });
  if (!fr) throw new Error('French language (code fr) not found');
  const before = {
    words: await prisma.word.count(),
    topics: await prisma.topic.count(),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/ext', requireApiKey, extRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api/v1/ext`;
  const H = { 'X-API-Key': 'test-key', 'Content-Type': 'application/json' };
  const show = async (label: string, r: Response) => {
    console.log(`${label} -> ${r.status} ${(await r.text()).slice(0, 400)}`);
  };

  try {
    await show('no key GET /languages', await fetch(`${base}/languages`));
    await show('bad key GET /languages', await fetch(`${base}/languages`, { headers: { 'X-API-Key': 'nope' } }));
    await show('bearer GET /languages', await fetch(`${base}/languages`, { headers: { Authorization: 'Bearer test-key' } }));
    const payload = JSON.stringify({
      language: 'FR',
      topic: TOPIC,
      words: [
        { term: TERMS[0], definition: 'smoke uno' },
        { term: TERMS[1].toUpperCase(), definition: 'smoke dos' },
      ],
    });
    await show('POST /words (1st)', await fetch(`${base}/words`, { method: 'POST', headers: H, body: payload }));
    await show('POST /words (2nd, expect 2 duplicates)', await fetch(`${base}/words`, { method: 'POST', headers: H, body: payload }));
    await show('POST /words invalid', await fetch(`${base}/words`, { method: 'POST', headers: H, body: '{"language":"fr","words":[]}' }));
    await show('GET /words/search', await fetch(`${base}/words/search?language=fr&q=${TERMS[0]}`, { headers: H }));
    await show('GET /topics', await fetch(`${base}/topics?language=fr`, { headers: H }));
  } finally {
    server.close();
    const topic = await prisma.topic.findFirst({ where: { languageId: fr.id, name: TOPIC } });
    if (topic) {
      const w = await prisma.word.deleteMany({ where: { topicId: topic.id } });
      await prisma.topic.delete({ where: { id: topic.id } });
      console.log(`cleanup: deleted ${w.count} words and topic ${TOPIC}`);
    }
    const after = { words: await prisma.word.count(), topics: await prisma.topic.count() };
    console.log('before', before, 'after', after, after.words === before.words && after.topics === before.topics ? 'OK untouched' : 'MISMATCH');
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
