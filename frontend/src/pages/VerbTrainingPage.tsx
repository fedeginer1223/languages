import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Volume2, Info, Check, X as XIcon } from 'lucide-react';
import { verbsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import type { VerbConjugation } from '../types';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];

const PERSON_LABELS = [
  { key: 'je', label: '1ʳᵉ p. sg.' },
  { key: 'tu', label: '2ᵉ p. sg.' },
  { key: 'il/elle', label: '3ᵉ p. sg.' },
  { key: 'nous', label: '1ʳᵉ p. pl.' },
  { key: 'vous', label: '2ᵉ p. pl.' },
  { key: 'ils/elles', label: '3ᵉ p. pl.' },
];

interface FieldState {
  answer: string;
  status: 'pending' | 'correct' | 'incorrect';
  expectedAnswer: string;
}

function normalizeAnswer(answer: string): string {
  return answer.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
}

export default function VerbTrainingPage() {
  const { verbId } = useParams<{ verbId: string }>();
  const navigate = useNavigate();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [currentTenseIndex, setCurrentTenseIndex] = useState(0);
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [incorrectTenses, setIncorrectTenses] = useState<number[]>([]);
  const [isSecondRound, setIsSecondRound] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const { data: verb, isLoading } = useQuery({
    queryKey: ['verb', verbId],
    queryFn: () => verbsApi.getById(verbId!),
    enabled: !!verbId,
  });

  // Group conjugations by tense
  const tenseGroups = verb?.conjugations.reduce((acc, conj) => {
    if (!acc[conj.tense]) {
      acc[conj.tense] = [];
    }
    acc[conj.tense].push(conj);
    return acc;
  }, {} as Record<string, VerbConjugation[]>) || {};

  const tenses = Object.keys(tenseGroups);
  const currentTense = tenses[currentTenseIndex];
  const currentConjugations = tenseGroups[currentTense] || [];
  const currentPersons = currentConjugations.map(c => c.person);
  const totalTenses = isSecondRound ? incorrectTenses.length : tenses.length;

  const allFieldsDone = currentPersons.length > 0 &&
    currentPersons.every(p => fields[p]?.status === 'correct' || fields[p]?.status === 'incorrect');

  useEffect(() => {
    // Reset fields when changing tense
    const initial: Record<string, FieldState> = {};
    for (const conj of currentConjugations) {
      initial[conj.person] = { answer: '', status: 'pending', expectedAnswer: conj.form };
    }
    setFields(initial);

    // Focus first input
    setTimeout(() => {
      const firstPerson = currentConjugations[0]?.person;
      if (firstPerson && inputRefs.current[firstPerson]) {
        inputRefs.current[firstPerson]?.focus();
      }
    }, 50);
  }, [currentTenseIndex, verb]);

  const handleAnswerChange = (person: string, value: string) => {
    setFields(prev => ({
      ...prev,
      [person]: { ...prev[person], answer: value },
    }));
  };

  const handleCheckField = async (person: string) => {
    const field = fields[person];
    if (!field || field.status !== 'pending' || !field.answer.trim()) return;

    const conjugation = currentConjugations.find(c => c.person === person);
    if (!conjugation) return;

    const userNorm = normalizeAnswer(field.answer);
    const correctNorm = normalizeAnswer(conjugation.form);
    const isCorrect = userNorm === correctNorm;

    // Update field status locally
    setFields(prev => ({
      ...prev,
      [person]: { ...prev[person], status: isCorrect ? 'correct' : 'incorrect' },
    }));

    // Save stats to backend
    try {
      await verbsApi.validateConjugation(conjugation.id, field.answer);
    } catch (e) {
      console.error('Failed to save stats:', e);
    }

    // Track incorrect tenses for second round
    if (!isCorrect && !isSecondRound) {
      setIncorrectTenses(prev => {
        if (!prev.includes(currentTenseIndex)) {
          return [...prev, currentTenseIndex];
        }
        return prev;
      });
    }

    // Focus next pending input
    const personIndex = currentPersons.indexOf(person);
    for (let i = personIndex + 1; i < currentPersons.length; i++) {
      const nextPerson = currentPersons[i];
      if (fields[nextPerson]?.status === 'pending' || nextPerson === currentPersons[i]) {
        setTimeout(() => inputRefs.current[nextPerson]?.focus(), 50);
        return;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, person: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCheckField(person);
    }
  };

  const handleContinue = () => {
    setCompletedCount(prev => prev + 1);

    if (isSecondRound) {
      const currentIncorrectIndex = incorrectTenses.indexOf(currentTenseIndex);
      if (currentIncorrectIndex < incorrectTenses.length - 1) {
        setCurrentTenseIndex(incorrectTenses[currentIncorrectIndex + 1]);
      } else {
        navigate(-1);
      }
    } else {
      if (currentTenseIndex < tenses.length - 1) {
        setCurrentTenseIndex(currentTenseIndex + 1);
      } else {
        if (incorrectTenses.length > 0) {
          setIsSecondRound(true);
          setCurrentTenseIndex(incorrectTenses[0]);
          setCompletedCount(0);
        } else {
          navigate(-1);
        }
      }
    }
  };

  const insertChar = (char: string) => {
    const activeElement = document.activeElement as HTMLInputElement;
    if (activeElement && activeElement.tagName === 'INPUT') {
      const start = activeElement.selectionStart || 0;
      const end = activeElement.selectionEnd || 0;
      const currentValue = activeElement.value;
      const newValue = currentValue.slice(0, start) + char + currentValue.slice(end);

      const person = activeElement.getAttribute('data-person');
      if (person) {
        setFields(prev => ({
          ...prev,
          [person]: { ...prev[person], answer: newValue },
        }));

        setTimeout(() => {
          activeElement.focus();
          activeElement.setSelectionRange(start + 1, start + 1);
        }, 0);
      }
    }
  };

  if (isLoading || !verb) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        {/* Close button */}
        <div className="flex justify-end mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Progress */}
        <Card className="mb-6">
          <CardContent className="py-3 text-center">
            <div className="text-xl font-bold">
              {completedCount}/{totalTenses}
              {isSecondRound && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (2ª ronda)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main card */}
        <Card className="shadow-xl">
          <CardContent className="p-8">
            {/* Verb name */}
            <div className="flex items-center gap-2 mb-6">
              <h1 className="text-3xl font-bold">{verb.infinitive}</h1>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Volume2 className="w-5 h-5 text-gray-500" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Info className="w-5 h-5 text-gray-500" />
              </Button>
            </div>

            {/* Tense name */}
            <h2 className="text-xl font-semibold mb-4">
              {currentTense?.replace(/_/g, ' ')}
            </h2>

            {/* Conjugation table */}
            <div className="space-y-0 mb-6">
              {currentPersons.map((person) => {
                const field = fields[person];
                const personLabel = PERSON_LABELS.find(p => p.key === person)?.label || person;
                if (!field) return null;

                const isCorrect = field.status === 'correct';
                const isIncorrect = field.status === 'incorrect';
                const isDone = field.status !== 'pending';

                return (
                  <div
                    key={person}
                    className={`flex items-center border-b transition-colors ${
                      isCorrect ? 'bg-green-50' : isIncorrect ? 'bg-red-50' : ''
                    }`}
                  >
                    <div className="w-32 p-3 font-medium border-r">{personLabel}</div>
                    <div className="flex-1 flex items-center">
                      {isDone ? (
                        <div className="flex-1 p-3 flex items-center gap-2">
                          {isCorrect ? (
                            <span className="text-green-700 font-medium">{field.answer}</span>
                          ) : (
                            <>
                              <span className="text-red-600 line-through">{field.answer}</span>
                              <span className="text-gray-700 font-medium">→ {field.expectedAnswer}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <Input
                          ref={(el) => { inputRefs.current[person] = el; }}
                          data-person={person}
                          value={field.answer}
                          onChange={(e) => handleAnswerChange(person, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, person)}
                          className="border-0 focus-visible:ring-0 bg-transparent"
                          placeholder=""
                        />
                      )}
                    </div>
                    {isDone && (
                      <div className="pr-3">
                        {isCorrect ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <XIcon className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* French characters keyboard */}
            {!allFieldsDone && (
              <div className="flex flex-wrap gap-1 mb-6">
                {FRENCH_CHARS.map((char) => (
                  <Button
                    key={char}
                    variant="outline"
                    size="sm"
                    onClick={() => insertChar(char)}
                    className="min-w-[40px]"
                  >
                    {char}
                  </Button>
                ))}
              </div>
            )}

            {/* Continue button (shown when all fields are checked) */}
            {allFieldsDone && (
              <Button
                onClick={handleContinue}
                className="px-8 py-6 text-lg"
              >
                Continuar
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
