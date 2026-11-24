import type { Topic } from '../types';

const key = (languageId: string) => `lastTopicId:${languageId}`;

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function rememberTopic(languageId: string, topicId: string): void {
  try {
    sessionStorage.setItem(key(languageId), topicId);
  } catch {
    // storage unavailable
  }
}

export function pickDefaultTopic(
  topics: Topic[] | undefined,
  languageId: string | undefined
): Topic | undefined {
  if (!topics || topics.length === 0) return undefined;

  if (languageId) {
    try {
      const remembered = sessionStorage.getItem(key(languageId));
      if (remembered) {
        const found = topics.find((t) => t.id === remembered);
        if (found) return found;
      }
    } catch {
      // storage unavailable
    }
  }

  const general = topics.find((t) => normalize(t.name) === 'vocabulario general');
  if (general) return general;

  return [...topics].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )[0];
}
