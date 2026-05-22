import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  Award,
  Battery,
  BookOpen,
  BookOpenCheck,
  Bookmark,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  Flame,
  Home as HomeIcon,
  Play,
  RotateCcw,
  Settings,
  Signal,
  Sliders,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Upload,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import './App.css';

type TabKey = 'home' | 'training' | 'notes' | 'settings';
type SubjectKey = 'data' | 'situation' | 'logic';
type ComfortRating = 'easy' | 'neutral' | 'hard';
type MethodFinderStep = 'select-type' | 'trial' | 'result';
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
type DifficultySheetMode = 'launch' | 'settings';

interface TableData {
  headers: string[];
  rows: string[][];
}

interface Question {
  id: string;
  subject: string;
  typeId: string;
  typeName: string;
  title: string;
  prompt: string;
  passage?: string;
  table?: TableData;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface IncorrectNote {
  id: string;
  subject: string;
  title: string;
  date: string;
  tags: string[];
  question: Question;
}

interface TrainingType {
  id: string;
  subjectKey: SubjectKey;
  subject: string;
  name: string;
  shortName: string;
  desc: string;
  icon: LucideIcon;
  generator: () => Question;
}

interface TrainingLaunchRequest {
  kind: 'daily' | 'single';
  types: TrainingType[];
}

interface DailyResult {
  correct: number;
  total: number;
  accuracy: number;
  selectedTypes: string[];
  completedAt: string;
}

interface SolutionMethod {
  id: string;
  typeId: string;
  name: string;
  bestFor: string;
  cue: string;
  steps: string[];
  warning: string;
}

interface MethodTrial {
  question: Question;
  method: SolutionMethod;
}

interface TypeTimingStat {
  attempts: number;
  correct: number;
  totalSeconds: number;
  bestSeconds: number;
  lastSeconds: number;
}

type TypeStats = Record<string, TypeTimingStat>;

interface MethodFitStat {
  attempts: number;
  correct: number;
  totalSeconds: number;
  comfortTotal: number;
  sessions: number;
  bestScore: number;
  lastScore: number;
  lastTriedAt: string;
}

type MethodStats = Record<string, MethodFitStat>;

interface MethodFitSummary {
  method: SolutionMethod;
  attempts: number;
  correct: number;
  accuracy: number;
  totalSeconds: number;
  avgSeconds: number;
  consistency: number;
  comfortScore: number;
  score: number;
  verdict: string;
}

interface IncorrectTypeGroup {
  key: string;
  subjectKey: SubjectKey;
  subject: string;
  title: string;
  typeId: string;
  count: number;
  questions: Question[];
}

interface BackupData {
  streakCount: number;
  totalSolved: number;
  accuracy: number;
  todaySolvedCount: number;
  todayTime: number;
  incorrectNotes: IncorrectNote[];
  typeStats?: TypeStats;
  methodStats?: MethodStats;
  selectedDifficulty?: DifficultyLevel;
  difficultyFixed?: boolean;
  quickTypeIds?: string[];
}

const STORAGE_KEYS = {
  streak: 'psat_streak',
  total: 'psat_total_solved',
  accuracy: 'psat_accuracy',
  todaySolved: 'psat_today_solved',
  todayTime: 'psat_today_time',
  incorrect: 'psat_incorrect_notes',
  amoled: 'psat_amoled',
  haptic: 'psat_haptic',
  dailyResult: 'psat_daily_result',
  typeStats: 'psat_type_timing_stats',
  methodStats: 'psat_method_fit_stats',
  difficulty: 'psat_training_difficulty',
  difficultyFixed: 'psat_training_difficulty_fixed',
  quickTypes: 'psat_quick_training_types',
};

const difficultyProfiles: Record<DifficultyLevel, {
  label: string;
  desc: string;
  perTypeOffset: number;
  secondsPerQuestion: number;
  minSeconds: number;
}> = {
  beginner: {
    label: '초급',
    desc: '작은 수, 적은 문항, 넉넉한 시간',
    perTypeOffset: -1,
    secondsPerQuestion: 70,
    minSeconds: 240,
  },
  intermediate: {
    label: '중급',
    desc: '기본 난이도와 표준 시간 압박',
    perTypeOffset: 0,
    secondsPerQuestion: 45,
    minSeconds: 240,
  },
  advanced: {
    label: '고급',
    desc: '큰 수, 많은 문항, 짧은 제한시간',
    perTypeOffset: 1,
    secondsPerQuestion: 32,
    minSeconds: 180,
  },
};

let activeGenerationDifficulty: DifficultyLevel = 'intermediate';

function adjustRangeByDifficulty(min: number, max: number): [number, number] {
  const range = max - min;
  if (range < 12) {
    return [min, max];
  }

  if (activeGenerationDifficulty === 'beginner') {
    return [min, min + Math.max(1, Math.round(range * 0.58))];
  }

  if (activeGenerationDifficulty === 'advanced') {
    return [max - Math.max(1, Math.round(range * 0.58)), max];
  }

  return [min, max];
}

function rand(min: number, max: number): number {
  const [adjustedMin, adjustedMax] = adjustRangeByDifficulty(min, max);
  return Math.floor(Math.random() * (adjustedMax - adjustedMin + 1)) + adjustedMin;
}

function pick<T>(items: T[]): T {
  return items[rand(0, items.length - 1)];
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = rand(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function numberFormat(value: number): string {
  return value.toLocaleString('ko-KR');
}

function percentFormat(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function makeChoices(correct: string, distractors: string[]): { options: string[]; correctIndex: number } {
  const unique = [correct];
  distractors.forEach((item) => {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  });
  while (unique.length < 5) {
    const extra = `${correct} ${unique.length}`;
    if (!unique.includes(extra)) {
      unique.push(extra);
    }
  }
  const options = shuffle(unique.slice(0, 5));
  return { options, correctIndex: options.indexOf(correct) };
}

function makeNumberChoices(answer: number, formatter = numberFormat, min = 0): { options: string[]; correctIndex: number } {
  const step = Math.max(1, Math.round(Math.abs(answer) * 0.08));
  const candidates = [
    answer + step,
    answer - step,
    answer + step * 2,
    answer - step * 2,
    answer + step + rand(1, 4),
  ].map((value) => Math.max(min, value));
  return makeChoices(formatter(answer), candidates.map(formatter));
}

function makeSmallCountChoices(answer: number, suffix = '개'): { options: string[]; correctIndex: number } {
  const candidates = [0, 1, 2, 3, 4, 5].filter((value) => value !== answer);
  return makeChoices(`${answer}${suffix}`, candidates.map((value) => `${value}${suffix}`));
}

function weekdayAfter(startIndex: number, days: number): number {
  return (startIndex + days) % 7;
}

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];

function buildQuestion(base: Omit<Question, 'id'>): Question {
  return { ...base, id: uid(base.typeId) };
}

function genMultiply(): Question {
  const a = rand(12, 39);
  const b = rand(14, 48);
  const adjustment = rand(3, 29);
  const answer = a * b + adjustment;
  const choices = makeNumberChoices(answer);
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-multiply',
    typeName: '곱연산',
    title: '곱연산 속산',
    prompt: `${a} x ${b}에 조정값 ${adjustment}를 더한 값은?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${a} x ${b} = ${numberFormat(a * b)}, 여기에 ${adjustment}를 더하면 ${numberFormat(answer)}입니다.`,
  });
}

function genRatio(): Question {
  const total = rand(30, 90) * 40;
  const rate = pick([12.5, 15, 20, 25, 30, 37.5, 40, 45, 60]);
  const part = Math.round((total * rate) / 100);
  const choices = makeNumberChoices(rate, percentFormat);
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-ratio',
    typeName: '비율/비중',
    title: '전체 대비 비중',
    prompt: `전체 ${numberFormat(total)}명 중 ${numberFormat(part)}명이 해당한다. 비중은?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${numberFormat(part)} / ${numberFormat(total)} x 100 = ${percentFormat(rate)}입니다.`,
  });
}

function genGrowth(): Question {
  const base = rand(60, 240) * 10;
  const rate = pick([5, 8, 10, 12.5, 15, 20, 25, 30]);
  const current = Math.round(base * (1 + rate / 100));
  const choices = makeNumberChoices(rate, percentFormat);
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-growth',
    typeName: '증감률',
    title: '전년 대비 증가율',
    prompt: `전년도 ${numberFormat(base)}건에서 올해 ${numberFormat(current)}건으로 증가했다. 증가율은?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `증가분 ${numberFormat(current - base)}를 전년도 ${numberFormat(base)}로 나누면 ${percentFormat(rate)}입니다.`,
  });
}

function genAverage(): Question {
  const countA = rand(3, 9) * 10;
  const countB = rand(2, 8) * 10;
  const avgA = rand(58, 78);
  const avgB = rand(80, 96);
  const answer = Math.round(((countA * avgA + countB * avgB) / (countA + countB)) * 10) / 10;
  const choices = makeNumberChoices(answer, (value) => value.toFixed(1));
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-average',
    typeName: '평균/가중평균',
    title: '두 집단 전체 평균',
    prompt: `A집단 ${countA}명의 평균은 ${avgA}점, B집단 ${countB}명의 평균은 ${avgB}점이다. 전체 평균은?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `(${countA} x ${avgA} + ${countB} x ${avgB}) / ${countA + countB} = ${answer.toFixed(1)}점입니다.`,
  });
}

function genTableBlank(): Question {
  const a = rand(80, 220);
  const b = rand(60, 180);
  const blank = rand(40, 160);
  const total = a + b + blank;
  const choices = makeNumberChoices(blank);
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-blank',
    typeName: '표 빈칸',
    title: '합계 빈칸 채우기',
    prompt: '다음 표에서 빈칸에 들어갈 값은?',
    table: {
      headers: ['구분', '값'],
      rows: [
        ['A', `${a}`],
        ['B', `${b}`],
        ['C', '빈칸'],
        ['합계', `${total}`],
      ],
    },
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${total} - ${a} - ${b} = ${blank}입니다.`,
  });
}

function genRank(): Question {
  const names = shuffle(['복지', '교통', '환경', '안전', '문화']).slice(0, 4);
  const increments = shuffle([14, 22, 31, 45]);
  const rows = names.map((name, index) => {
    const start = rand(70, 180);
    return [name, `${start}`, `${start + increments[index]}`];
  });
  const answerIndex = increments.indexOf(Math.max(...increments));
  const answer = names[answerIndex];
  const choices = makeChoices(answer, names.filter((name) => name !== answer));
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-rank',
    typeName: '순위 비교',
    title: '증가폭 순위 판단',
    prompt: '2025년 대비 2026년 증가폭이 가장 큰 분야는?',
    table: {
      headers: ['분야', '2025', '2026'],
      rows,
    },
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${answer}의 증가폭은 ${increments[answerIndex]}로 가장 큽니다.`,
  });
}

function genUnit(): Question {
  const value = rand(12, 98);
  const answer = value * 10000;
  const choices = makeNumberChoices(answer, numberFormat);
  return buildQuestion({
    subject: '자료해석',
    typeId: 'data-unit',
    typeName: '단위 변환',
    title: '만 단위 환산',
    prompt: `자료의 단위가 '만 명'일 때 ${value}는 실제 몇 명인가?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${value}만 명은 ${value} x 10,000 = ${numberFormat(answer)}명입니다.`,
  });
}

function genRule(): Question {
  const caps: Record<string, number> = { 일반: 60000, 광역: 80000, 특수: 100000 };
  const regionA = pick(Object.keys(caps));
  const regionB = pick(Object.keys(caps));
  const training = Math.random() > 0.45;
  const multiplier = training ? 1.2 : 1;
  const expenseA = rand(7, 15) * 10000;
  const expenseB = rand(6, 14) * 10000;
  const capA = Math.round(caps[regionA] * multiplier);
  const capB = Math.round(caps[regionB] * multiplier);
  const answer = Math.min(expenseA, capA) + Math.min(expenseB, capB);
  const choices = makeNumberChoices(answer, (value) => `${numberFormat(value)}원`);
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-rule',
    typeName: '규정 적용',
    title: '출장비 보전 한도',
    prompt: '규정과 사례에 따라 보전 가능한 총액은?',
    passage: [
      '일반 지역은 1박당 6만 원, 광역 지역은 8만 원, 특수 지역은 10만 원까지 보전한다.',
      '교육 목적 출장인 경우 한도를 20% 가산한다.',
      `사례: ${training ? '교육 목적' : '일반'} 출장으로 ${regionA} 지역 ${numberFormat(expenseA)}원, ${regionB} 지역 ${numberFormat(expenseB)}원을 지출했다.`,
    ].join('\n'),
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `각 지출액과 한도 중 작은 값을 더합니다. ${numberFormat(Math.min(expenseA, capA))} + ${numberFormat(Math.min(expenseB, capB))} = ${numberFormat(answer)}원입니다.`,
  });
}

function genQualification(): Question {
  const minScore = rand(70, 82);
  const minMonths = pick([6, 9, 12]);
  const applicants = ['갑', '을', '병', '정'].map((name) => ({
    name,
    score: rand(64, 94),
    months: rand(3, 18),
    missing: Math.random() > 0.72,
  }));
  const eligible = applicants.filter((item) => item.score >= minScore && item.months >= minMonths && !item.missing);
  const choices = makeSmallCountChoices(eligible.length, '명');
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-qualification',
    typeName: '자격 판단',
    title: '지원 가능 인원',
    prompt: '규정에 따라 지원 가능한 사람은 몇 명인가?',
    passage: `평가점수 ${minScore}점 이상, 근무기간 ${minMonths}개월 이상이어야 한다. 필수서류 누락이 있으면 지원할 수 없다.`,
    table: {
      headers: ['대상', '점수', '개월', '서류누락'],
      rows: applicants.map((item) => [item.name, `${item.score}`, `${item.months}`, item.missing ? '있음' : '없음']),
    },
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `점수, 기간, 서류 요건을 모두 통과한 사람은 ${eligible.length}명입니다.`,
  });
}

function genScoreCalc(): Question {
  const base = rand(62, 84);
  const bonus = rand(3, 12);
  const penalty = rand(1, 8);
  const answer = base + bonus - penalty;
  const choices = makeNumberChoices(answer, (value) => `${value}점`);
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-score',
    typeName: '금액/점수 계산',
    title: '평가 점수 산정',
    prompt: `기본점수 ${base}점, 가점 ${bonus}점, 감점 ${penalty}점을 적용한 최종점수는?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${base} + ${bonus} - ${penalty} = ${answer}점입니다.`,
  });
}

function genSchedule(): Question {
  const startIndex = rand(0, 4);
  const days = rand(5, 18);
  const answerIndex = weekdayAfter(startIndex, days);
  const choices = makeChoices(`${weekdays[answerIndex]}요일`, weekdays.map((day) => `${day}요일`).filter((day) => day !== `${weekdays[answerIndex]}요일`));
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-schedule',
    typeName: '일정/요일',
    title: '기한 도래 요일',
    prompt: `${weekdays[startIndex]}요일에 접수한 민원의 처리기한이 ${days}일 후라면, 처리기한 도래 요일은?`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${weekdays[startIndex]}요일에서 ${days}일 후는 ${weekdays[answerIndex]}요일입니다.`,
  });
}

function genMatching(): Question {
  const people = shuffle(['민서', '지훈', '서연']);
  const rooms = shuffle(['A실', 'B실', 'C실']);
  const answer = `${people[0]}-${rooms[0]}, ${people[1]}-${rooms[1]}, ${people[2]}-${rooms[2]}`;
  const distractors = new Set<string>();
  while (distractors.size < 4) {
    const roomShuffle = shuffle(rooms);
    const candidate = `${people[0]}-${roomShuffle[0]}, ${people[1]}-${roomShuffle[1]}, ${people[2]}-${roomShuffle[2]}`;
    if (candidate !== answer) {
      distractors.add(candidate);
    }
  }
  const choices = makeChoices(answer, [...distractors]);
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-matching',
    typeName: '배치/매칭',
    title: '회의실 배정',
    prompt: '조건을 모두 만족하는 배정은?',
    passage: `${people[0]}는 ${rooms[0]}을 사용한다. ${people[1]}는 ${rooms[2]}을 사용할 수 없다. ${people[2]}는 남은 회의실을 사용한다.`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `${people[0]}-${rooms[0]}가 확정되고, ${people[1]}는 ${rooms[2]}을 사용할 수 없으므로 ${rooms[1]}입니다. 남은 ${rooms[2]}는 ${people[2]}입니다.`,
  });
}

function genCases(): Question {
  const costs = shuffle([20, 30, 40, 50, 60]).slice(0, 4);
  const limit = pick([70, 80, 90]);
  let count = 0;
  for (let i = 0; i < costs.length; i += 1) {
    for (let j = i + 1; j < costs.length; j += 1) {
      if (costs[i] + costs[j] <= limit) {
        count += 1;
      }
    }
  }
  const choices = makeSmallCountChoices(count, '가지');
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-cases',
    typeName: '경우의 수',
    title: '예산 한도 내 조합',
    prompt: `다음 네 사업 중 2개를 골라 총액이 ${limit}억 원 이하가 되는 경우의 수는?`,
    table: {
      headers: ['사업', '비용'],
      rows: costs.map((cost, index) => [`사업 ${index + 1}`, `${cost}억`]),
    },
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `두 사업의 비용 합이 ${limit}억 원 이하인 조합은 ${count}가지입니다.`,
  });
}

function genOrder(): Question {
  const names = shuffle(['가', '나', '다', '라']);
  const order = shuffle(names);
  const answer = order.join(' - ');
  const distractors = new Set<string>();
  while (distractors.size < 4) {
    const candidate = shuffle(order).join(' - ');
    if (candidate !== answer) {
      distractors.add(candidate);
    }
  }
  const choices = makeChoices(answer, [...distractors]);
  return buildQuestion({
    subject: '상황판단',
    typeId: 'sit-order',
    typeName: '순서 조건',
    title: '발표 순서',
    prompt: '조건을 모두 만족하는 발표 순서는?',
    passage: `${order[0]}는 첫 번째이다. ${order[1]}는 ${order[2]} 바로 앞이다. ${order[3]}는 ${order[2]}보다 뒤이다.`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `첫 번째가 ${order[0]}이고, ${order[1]}-${order[2]}가 붙어야 하며, ${order[3]}는 그 뒤입니다.`,
  });
}

function genTrueFalse(): Question {
  const colors = ['빨강', '파랑', '초록'];
  const answerColor = pick(colors);
  const choices = makeChoices(answerColor, colors.filter((color) => color !== answerColor).concat(['알 수 없음', '두 색 모두 가능']));
  return buildQuestion({
    subject: '언어논리',
    typeId: 'logic-truefalse',
    typeName: '참거짓',
    title: '하나만 참인 진술',
    prompt: '다음 세 진술 중 정확히 하나만 참일 때, 갑의 카드 색은?',
    passage: [
      `진술 1: 갑의 카드는 ${answerColor}이다.`,
      `진술 2: 갑의 카드는 ${pick(colors.filter((color) => color !== answerColor))}이다.`,
      '진술 3: 진술 1과 진술 2는 모두 참이다.',
    ].join('\n'),
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `진술 1만 참이 되려면 갑의 카드는 ${answerColor}이어야 합니다.`,
  });
}

function genProposition(): Question {
  const p = '자료해석을 훈련한다';
  const q = '비율 계산이 빨라진다';
  const r = '표 선지 판단 시간이 줄어든다';
  const correct = `${p}면 ${r}`;
  const choices = makeChoices(correct, [`${r}면 ${p}`, `${q}면 ${p}`, `${p}면 ${q}가 아니다`, `${r}이면 ${q}가 아니다`]);
  return buildQuestion({
    subject: '언어논리',
    typeId: 'logic-proposition',
    typeName: '명제 추론',
    title: '연쇄 명제',
    prompt: '두 명제가 모두 참일 때 반드시 참인 것은?',
    passage: `명제 A: ${p}면 ${q}.\n명제 B: ${q}면 ${r}.`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `A와 B를 연결하면 '${p}면 ${r}'가 반드시 참입니다.`,
  });
}

function genNecessary(): Question {
  const correct = '신청자는 교육을 이수했다';
  const choices = makeChoices(correct, ['신청자는 가점을 받았다', '교육 이수자는 모두 신청했다', '미신청자는 교육을 이수하지 않았다', '교육 미이수자도 신청할 수 있다']);
  return buildQuestion({
    subject: '언어논리',
    typeId: 'logic-necessary',
    typeName: '필요/충분조건',
    title: '필요조건 판단',
    prompt: '"신청하려면 교육을 이수해야 한다"가 참이고, 갑이 신청했다면 반드시 참인 것은?',
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: '신청은 교육 이수의 충분조건이고, 교육 이수는 신청의 필요조건입니다.',
  });
}

function genMustBe(): Question {
  const order = ['갑', '을', '병', '정'];
  const correct = '병은 을보다 앞선다';
  const choices = makeChoices(correct, ['갑은 병보다 앞선다', '정은 을보다 앞선다', '을은 병보다 앞선다', '정은 갑보다 앞선다']);
  return buildQuestion({
    subject: '언어논리',
    typeId: 'logic-must',
    typeName: '반드시 참',
    title: '순위 관계',
    prompt: '조건이 모두 참일 때 반드시 참인 것은?',
    passage: `${order[0]}는 ${order[1]}보다 앞선다. ${order[2]}는 ${order[0]}보다 앞선다. ${order[3]}는 ${order[1]}보다 뒤이다.`,
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: `병 > 갑 > 을 관계가 성립하므로 병은 을보다 앞섭니다.`,
  });
}

function genSequenceLogic(): Question {
  return genOrder();
}

function genCorrespondence(): Question {
  const names = ['갑', '을', '병'];
  const jobs = ['분석', '작성', '검토'];
  const answer = `${names[0]}-${jobs[1]}, ${names[1]}-${jobs[2]}, ${names[2]}-${jobs[0]}`;
  const choices = makeChoices(answer, [
    `${names[0]}-${jobs[0]}, ${names[1]}-${jobs[1]}, ${names[2]}-${jobs[2]}`,
    `${names[0]}-${jobs[2]}, ${names[1]}-${jobs[0]}, ${names[2]}-${jobs[1]}`,
    `${names[0]}-${jobs[1]}, ${names[1]}-${jobs[0]}, ${names[2]}-${jobs[2]}`,
    `${names[0]}-${jobs[0]}, ${names[1]}-${jobs[2]}, ${names[2]}-${jobs[1]}`,
  ]);
  return buildQuestion({
    subject: '언어논리',
    typeId: 'logic-correspondence',
    typeName: '대응관계',
    title: '역할 대응',
    prompt: '조건을 만족하는 역할 배정은?',
    passage: '갑은 작성을 맡는다. 을은 분석을 맡지 않는다. 병은 남은 업무를 맡는다.',
    options: choices.options,
    correctIndex: choices.correctIndex,
    explanation: '갑-작성, 을-검토가 확정되므로 병은 분석을 맡습니다.',
  });
}

const trainingTypes: TrainingType[] = [
  { id: 'data-multiply', subjectKey: 'data', subject: '자료해석', name: '곱연산', shortName: '곱연산', desc: '두 자리 곱셈과 조정값 속산', icon: Zap, generator: genMultiply },
  { id: 'data-ratio', subjectKey: 'data', subject: '자료해석', name: '비율/비중', shortName: '비율', desc: '부분값과 전체값의 기준 확인', icon: Activity, generator: genRatio },
  { id: 'data-growth', subjectKey: 'data', subject: '자료해석', name: '증감률', shortName: '증감', desc: '전년 대비 변화율 계산', icon: Activity, generator: genGrowth },
  { id: 'data-average', subjectKey: 'data', subject: '자료해석', name: '평균/가중평균', shortName: '평균', desc: '전체-부분 평균 함정 제거', icon: BookOpenCheck, generator: genAverage },
  { id: 'data-blank', subjectKey: 'data', subject: '자료해석', name: '표 빈칸', shortName: '빈칸', desc: '합계와 누락값 빠른 역산', icon: FileText, generator: genTableBlank },
  { id: 'data-rank', subjectKey: 'data', subject: '자료해석', name: '순위 비교', shortName: '순위', desc: '증가폭, 최대/최소 판단', icon: Award, generator: genRank },
  { id: 'data-unit', subjectKey: 'data', subject: '자료해석', name: '단위 변환', shortName: '단위', desc: '만 명, 억 원 단위 실수 차단', icon: Sliders, generator: genUnit },
  { id: 'sit-rule', subjectKey: 'situation', subject: '상황판단', name: '규정 적용', shortName: '규정', desc: '한도, 예외, 가산 규칙 적용', icon: FileText, generator: genRule },
  { id: 'sit-qualification', subjectKey: 'situation', subject: '상황판단', name: '자격 판단', shortName: '자격', desc: '요건과 결격사유 체크', icon: CheckCircle2, generator: genQualification },
  { id: 'sit-score', subjectKey: 'situation', subject: '상황판단', name: '금액/점수 계산', shortName: '점수', desc: '가점, 감점, 최종 산정', icon: Award, generator: genScoreCalc },
  { id: 'sit-schedule', subjectKey: 'situation', subject: '상황판단', name: '일정/요일', shortName: '요일', desc: '기한과 날짜 이동 판단', icon: Timer, generator: genSchedule },
  { id: 'sit-matching', subjectKey: 'situation', subject: '상황판단', name: '배치/매칭', shortName: '매칭', desc: '대상-장소 대응관계 소거', icon: Compass, generator: genMatching },
  { id: 'sit-cases', subjectKey: 'situation', subject: '상황판단', name: '경우의 수', shortName: '경우', desc: '조건 만족 조합 세기', icon: BookOpen, generator: genCases },
  { id: 'sit-order', subjectKey: 'situation', subject: '상황판단', name: '순서 조건', shortName: '순서', desc: '앞뒤 관계와 붙어 있음 처리', icon: RotateCcw, generator: genOrder },
  { id: 'logic-truefalse', subjectKey: 'logic', subject: '언어논리', name: '참거짓', shortName: '진위', desc: '한 진술만 참인 구조 파악', icon: Sparkles, generator: genTrueFalse },
  { id: 'logic-proposition', subjectKey: 'logic', subject: '언어논리', name: '명제 추론', shortName: '명제', desc: '조건문 연쇄와 대우', icon: BookOpen, generator: genProposition },
  { id: 'logic-necessary', subjectKey: 'logic', subject: '언어논리', name: '필요/충분조건', shortName: '조건', desc: '필요조건과 충분조건 방향', icon: Sliders, generator: genNecessary },
  { id: 'logic-must', subjectKey: 'logic', subject: '언어논리', name: '반드시 참', shortName: '필참', desc: '확정 정보만으로 결론 도출', icon: CheckCircle2, generator: genMustBe },
  { id: 'logic-sequence', subjectKey: 'logic', subject: '언어논리', name: '순서 논리', shortName: '논리순서', desc: '순서 조건을 도식화', icon: RotateCcw, generator: genSequenceLogic },
  { id: 'logic-correspondence', subjectKey: 'logic', subject: '언어논리', name: '대응관계', shortName: '대응', desc: '사람-역할 매칭 매트릭스', icon: Compass, generator: genCorrespondence },
];

const defaultQuickTypeIds = trainingTypes.slice(0, 8).map((type) => type.id);

function normalizeTrainingTypeIds(value: unknown, fallback = defaultQuickTypeIds): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const validIds = new Set(trainingTypes.map((type) => type.id));
  const uniqueIds = value.filter((id): id is string => typeof id === 'string' && validIds.has(id));
  return [...new Set(uniqueIds)];
}

const solutionMethods: SolutionMethod[] = [
  { id: 'data-multiply-standard', typeId: 'data-multiply', name: '정석 계산형', bestFor: '계산 실수가 적고 자릿수 감각이 안정적인 사람', cue: '식을 그대로 세우고 중간값을 깔끔하게 적는다.', steps: ['십의 자리 곱과 일의 자리 곱을 분리한다.', '중간합을 한 번만 적고 조정값을 더한다.', '선지 자릿수와 끝자리를 확인한다.'], warning: '속도는 느릴 수 있지만 오답 방어력이 좋다.' },
  { id: 'data-multiply-split', typeId: 'data-multiply', name: '분해 곱셈형', bestFor: '숫자를 쪼개면 머릿속 계산이 편한 사람', cue: '한쪽 수를 10, 20, 30 단위로 분해한다.', steps: ['곱하기 쉬운 기준수로 나눈다.', '각 부분곱을 더한 뒤 조정값을 반영한다.', '끝자리로 한 번 더 검산한다.'], warning: '분해한 항을 하나 빠뜨리면 바로 오답이 난다.' },
  { id: 'data-multiply-eliminate', typeId: 'data-multiply', name: '보정/선지소거형', bestFor: '정확한 값보다 선지 차이를 빠르게 보는 사람', cue: '기준 곱을 만든 뒤 차이만 보정한다.', steps: ['가까운 10의 배수로 기준 곱을 만든다.', '초과 또는 부족분만 더하고 뺀다.', '선지 간격이 크면 근삿값으로 먼저 지운다.'], warning: '선지 간격이 촘촘하면 끝까지 정확 계산해야 한다.' },

  { id: 'data-ratio-fraction', typeId: 'data-ratio', name: '분수 직산형', bestFor: '분수와 약분이 편한 사람', cue: '부분/전체를 먼저 약분한다.', steps: ['분모와 분자를 작은 수로 줄인다.', '익숙한 분수 비율로 바꾼다.', '필요할 때만 100을 곱한다.'], warning: '약분이 안 되는 수에서 오래 붙잡히면 손해다.' },
  { id: 'data-ratio-base100', typeId: 'data-ratio', name: '100 기준 환산형', bestFor: '퍼센트 감각이 강한 사람', cue: '전체를 100으로 놓고 부분을 환산한다.', steps: ['전체값이 100이 되도록 배율을 잡는다.', '부분값에도 같은 배율을 적용한다.', '선지와 가장 가까운 값을 고른다.'], warning: '반올림 방향을 놓치면 1~2%p 차이에서 틀린다.' },
  { id: 'data-ratio-cross', typeId: 'data-ratio', name: '교차곱 비교형', bestFor: '선지가 비율 형태로 주어질 때 빠른 사람', cue: '나눗셈 대신 양쪽을 곱해 비교한다.', steps: ['후보 비율을 분수로 본다.', '부분 x 후보분모와 전체 x 후보분자를 비교한다.', '차이가 가장 작은 선지를 남긴다.'], warning: '정답값을 직접 말해야 하는 문제에는 보조 도구로만 쓴다.' },

  { id: 'data-growth-formula', typeId: 'data-growth', name: '증가분 공식형', bestFor: '공식 적용이 빠르고 안정적인 사람', cue: '증가분/기준값을 고정한다.', steps: ['현재값에서 기준값을 뺀다.', '증가분을 기준값으로 나눈다.', '100을 곱하고 선지 단위를 확인한다.'], warning: '현재값을 분모로 쓰는 실수를 가장 조심해야 한다.' },
  { id: 'data-growth-multiple', typeId: 'data-growth', name: '배율 감각형', bestFor: '1.1배, 1.25배 같은 배율이 익숙한 사람', cue: '현재값이 기준값의 몇 배인지 본다.', steps: ['현재/기준을 배율로 본다.', '1을 뺀 값이 증감률임을 확인한다.', '익숙한 배율 선지부터 대조한다.'], warning: '감소율 문제에서는 방향을 반대로 잡기 쉽다.' },
  { id: 'data-growth-eliminate', typeId: 'data-growth', name: '선지 소거형', bestFor: '정확 계산 전에 답 범위를 빠르게 좁히는 사람', cue: '10%, 20%, 25% 같은 기준 선지를 먼저 대입한다.', steps: ['기준값의 10%를 빠르게 구한다.', '증가분이 몇 개의 10%인지 본다.', '가까운 선지 2개만 남기고 정밀 계산한다.'], warning: '선지가 촘촘하면 마지막 정밀 계산을 생략하면 안 된다.' },

  { id: 'data-average-total', typeId: 'data-average', name: '전체합 정석형', bestFor: '계산식을 세우면 흔들리지 않는 사람', cue: '각 집단의 총합을 만든다.', steps: ['인원 x 평균으로 집단합을 구한다.', '집단합을 모두 더한다.', '전체 인원으로 나눈다.'], warning: '단순 평균을 내는 함정에 걸리지 않게 인원수를 크게 표시한다.' },
  { id: 'data-average-baseline', typeId: 'data-average', name: '기준평균 보정형', bestFor: '큰 수 계산을 줄이고 싶은 사람', cue: '편한 기준평균을 잡고 차이만 보정한다.', steps: ['한 평균값 또는 70점 같은 기준을 정한다.', '각 집단의 기준 대비 차이를 인원수만큼 반영한다.', '총 보정값을 전체 인원으로 나눈다.'], warning: '보정값의 부호를 헷갈리면 답이 반대로 간다.' },
  { id: 'data-average-distance', typeId: 'data-average', name: '거리법형', bestFor: '가중평균 위치 감각이 좋은 사람', cue: '평균은 두 값 사이에서 인원 많은 쪽에 가깝다.', steps: ['두 평균 사이 간격을 본다.', '인원비의 반대비로 전체 평균 위치를 잡는다.', '선지가 위치 범위를 벗어나면 지운다.'], warning: '정확한 소수 첫째 자리까지 요구하면 마지막 계산이 필요하다.' },

  { id: 'data-blank-sum', typeId: 'data-blank', name: '합계 역산형', bestFor: '표 합계가 눈에 잘 들어오는 사람', cue: '빈칸이 포함된 행/열 합계를 먼저 찾는다.', steps: ['알려진 값들을 모두 더한다.', '합계에서 알려진 값을 뺀다.', '반대 방향 합계로 검산한다.'], warning: '행 합계와 열 합계를 섞어 쓰지 않게 표시가 필요하다.' },
  { id: 'data-blank-cross', typeId: 'data-blank', name: '행열 교차검산형', bestFor: '표 구조를 보는 게 편한 사람', cue: '빈칸이 만나는 행과 열을 둘 다 쓴다.', steps: ['행 기준 후보값을 구한다.', '열 기준 후보값과 일치하는지 본다.', '불일치하면 누락된 조건을 다시 확인한다.'], warning: '검산은 강하지만 시간이 조금 더 든다.' },
  { id: 'data-blank-choice', typeId: 'data-blank', name: '선지 대입형', bestFor: '계산보다 조건 만족 여부 확인이 빠른 사람', cue: '선지를 넣어 합계가 맞는지만 본다.', steps: ['가장 가운데 선지를 먼저 넣는다.', '합계보다 크거나 작으면 방향을 잡는다.', '남은 후보만 계산한다.'], warning: '선지가 많고 간격이 좁으면 오히려 느릴 수 있다.' },

  { id: 'data-rank-delta', typeId: 'data-rank', name: '변화폭 먼저형', bestFor: '차이를 빨리 잡는 사람', cue: '각 항목의 끝값-시작값만 본다.', steps: ['모든 행의 차이를 간단히 적는다.', '최대/최소 후보만 남긴다.', '동률이면 원자료를 다시 확인한다.'], warning: '변화율을 묻는 문제에는 변화폭만 보면 위험하다.' },
  { id: 'data-rank-candidate', typeId: 'data-rank', name: '후보 좁히기형', bestFor: '표 전체를 다 계산하면 지치는 사람', cue: '눈에 띄는 큰 값과 작은 값부터 후보화한다.', steps: ['선지가 묻는 방향과 맞는 후보만 고른다.', '후보끼리만 정밀 계산한다.', '나머지는 선지에서 제거한다.'], warning: '숨어 있는 작은 분모의 변화율을 놓칠 수 있다.' },
  { id: 'data-rank-choice', typeId: 'data-rank', name: '선지 검증형', bestFor: '보기 구조를 이용하는 게 빠른 사람', cue: '보기 순서대로 참/거짓만 빠르게 판정한다.', steps: ['각 선지가 요구하는 비교쌍만 계산한다.', '틀린 비교 하나가 나오면 즉시 버린다.', '남은 선지만 전체 검산한다.'], warning: '선지가 복잡하면 읽는 시간이 늘어난다.' },

  { id: 'data-unit-mark', typeId: 'data-unit', name: '단위 먼저형', bestFor: '단위 실수가 잦은 사람', cue: '계산 전에 단위를 크게 적는다.', steps: ['만, 억, 천 등 단위를 먼저 실제 수로 바꾼다.', '모든 값의 단위를 통일한다.', '정답 선지 단위로 다시 맞춘다.'], warning: '느려 보여도 단위 실수 방지에는 가장 강하다.' },
  { id: 'data-unit-digit', typeId: 'data-unit', name: '자릿수 소거형', bestFor: '0 개수 감각이 좋은 사람', cue: '정확 계산 전에 0의 개수로 선지를 지운다.', steps: ['단위가 붙이는 0 개수를 센다.', '선지 자릿수가 맞지 않으면 제거한다.', '남은 값만 정확 계산한다.'], warning: '소수나 반올림이 섞이면 자릿수만으로 부족하다.' },
  { id: 'data-unit-block', typeId: 'data-unit', name: '만/억 분리형', bestFor: '큰 수를 덩어리로 보는 사람', cue: '숫자를 네 자리 단위 덩어리로 나눈다.', steps: ['만 단위마다 끊어 읽는다.', '억 단위가 나오면 만 x 만 구조를 확인한다.', '정답 표기 단위로 변환한다.'], warning: '천 단위 콤마와 한국식 만 단위가 충돌할 수 있다.' },

  { id: 'sit-rule-requirement', typeId: 'sit-rule', name: '요건-효과 분리형', bestFor: '규정 문장을 구조화하면 편한 사람', cue: '요건과 결과를 따로 줄긋는다.', steps: ['적용 조건을 먼저 표시한다.', '조건이 맞을 때 생기는 효과를 따로 적는다.', '사례값을 효과식에 넣는다.'], warning: '예외 조항을 뒤늦게 발견하면 다시 풀어야 한다.' },
  { id: 'sit-rule-exception', typeId: 'sit-rule', name: '예외 먼저형', bestFor: '규정 문제에서 함정에 자주 걸리는 사람', cue: '단서, 다만, 제외를 가장 먼저 본다.', steps: ['예외 문구를 먼저 찾아 표시한다.', '사례가 예외에 걸리는지 판정한다.', '남은 경우에 일반 규정을 적용한다.'], warning: '예외가 없는 단순 문제에서는 조금 느릴 수 있다.' },
  { id: 'sit-rule-choice', typeId: 'sit-rule', name: '선지 기준 대입형', bestFor: '규정을 다 읽기 전에 보기로 방향을 잡는 사람', cue: '선지가 묻는 값만 규정에서 찾는다.', steps: ['선지들이 갈리는 쟁점을 찾는다.', '그 쟁점과 관련된 조항만 읽는다.', '사례에 넣어 맞는 선지를 고른다.'], warning: '조항 간 연결이 강한 문제에서는 누락 위험이 있다.' },

  { id: 'sit-qualification-disqualify', typeId: 'sit-qualification', name: '결격사유 먼저형', bestFor: '탈락자를 빠르게 지우는 사람', cue: '안 되는 조건부터 지운다.', steps: ['결격사유를 먼저 표시한다.', '해당자를 즉시 X 처리한다.', '남은 사람에게 필수요건을 적용한다.'], warning: '필수요건 누락자를 놓치지 않게 두 번째 체크가 필요하다.' },
  { id: 'sit-qualification-checklist', typeId: 'sit-qualification', name: '체크박스형', bestFor: '조건이 많으면 표로 봐야 편한 사람', cue: '요건마다 칸을 만들고 O/X를 찍는다.', steps: ['필수 조건을 열로 만든다.', '대상자마다 O/X를 채운다.', '모든 칸이 O인 대상만 센다.'], warning: '시간은 들지만 안정성이 가장 좋다.' },
  { id: 'sit-qualification-person', typeId: 'sit-qualification', name: '대상자별 탈락형', bestFor: '사람 하나씩 처리하는 게 편한 사람', cue: '한 사람을 끝까지 판정하고 다음으로 넘어간다.', steps: ['첫 대상자의 모든 조건을 확인한다.', '탈락 사유가 나오면 즉시 다음으로 간다.', '통과자 수를 누적한다.'], warning: '조건을 반복해서 읽게 되어 길어질 수 있다.' },

  { id: 'sit-score-stack', typeId: 'sit-score', name: '기본식 누적형', bestFor: '계산 순서를 적으면 실수가 줄어드는 사람', cue: '기본값 + 가점 - 감점을 한 줄로 쓴다.', steps: ['기본값을 먼저 둔다.', '가점과 감점을 순서대로 반영한다.', '최종값에 단위와 반올림을 적용한다.'], warning: '상한/하한 규정은 마지막에 반드시 확인해야 한다.' },
  { id: 'sit-score-cap', typeId: 'sit-score', name: '상한/하한 먼저형', bestFor: '한도 조건을 자주 놓치는 사람', cue: '최종 계산 전에 한도선을 표시한다.', steps: ['최대/최소 인정값을 먼저 적는다.', '계산 결과가 한도를 넘는지 본다.', '한도 안의 값만 정답으로 둔다.'], warning: '한도가 항목별인지 총액별인지 구분해야 한다.' },
  { id: 'sit-score-reverse', typeId: 'sit-score', name: '선지 역산형', bestFor: '보기 값이 뚜렷하게 벌어진 문제에 강한 사람', cue: '선지를 최종값으로 놓고 거꾸로 맞춘다.', steps: ['가장 그럴듯한 선지를 고른다.', '가점/감점을 역으로 제거한다.', '기본값과 일치하는지 확인한다.'], warning: '선지가 촘촘하면 정석 계산보다 느려진다.' },

  { id: 'sit-schedule-mod', typeId: 'sit-schedule', name: 'mod 7 계산형', bestFor: '숫자로 요일 이동을 처리하는 사람', cue: '며칠 뒤인지 7로 나눈 나머지만 본다.', steps: ['시작 요일을 0~6으로 바꾼다.', '이동일수를 더하고 7로 나눈다.', '나머지에 해당하는 요일을 고른다.'], warning: '시작일 포함 여부가 나오면 먼저 보정해야 한다.' },
  { id: 'sit-schedule-calendar', typeId: 'sit-schedule', name: '달력 칸형', bestFor: '시각적으로 날짜를 세는 게 편한 사람', cue: '간단한 7칸 달력을 머릿속에 그린다.', steps: ['시작 요일 칸에 기준일을 놓는다.', '한 주 단위로 건너뛴다.', '남은 날짜만 칸으로 이동한다.'], warning: '긴 기간에는 mod 7보다 느리다.' },
  { id: 'sit-schedule-include', typeId: 'sit-schedule', name: '기준일 포함형', bestFor: '포함/불포함 실수가 잦은 사람', cue: '첫날을 0일인지 1일인지 먼저 결정한다.', steps: ['문구에서 당일 포함 여부를 찾는다.', '포함이면 이동일수에서 1을 보정한다.', '그 뒤 요일 이동을 계산한다.'], warning: '문제마다 기준 표현이 달라 자동화하면 위험하다.' },

  { id: 'sit-matching-matrix', typeId: 'sit-matching', name: '매트릭스형', bestFor: '대응관계를 표로 보면 편한 사람', cue: '사람 x 항목 표에 O/X를 찍는다.', steps: ['확정 조건은 O로 표시한다.', '같은 행/열의 나머지를 X 처리한다.', '남은 빈칸을 조건으로 채운다.'], warning: '작은 문제에서는 표를 그리는 시간이 아까울 수 있다.' },
  { id: 'sit-matching-fixed', typeId: 'sit-matching', name: '확정조건 먼저형', bestFor: '바로 정해지는 조건을 잘 찾는 사람', cue: '단정문부터 처리한다.', steps: ['반드시 ~이다 조건을 먼저 확정한다.', '그 확정이 만드는 제외를 반영한다.', '조건문은 그 다음 적용한다.'], warning: '부정조건만 많은 문제에서는 효과가 약하다.' },
  { id: 'sit-matching-choice', typeId: 'sit-matching', name: '선지 대입형', bestFor: '보기 하나가 통째로 배정표인 문제에 강한 사람', cue: '선지를 넣어 위반 조건 하나를 찾는다.', steps: ['선지 하나를 배정표로 본다.', '조건을 위에서부터 대조한다.', '위반이 하나라도 있으면 제거한다.'], warning: '조건 수가 많으면 매트릭스보다 느려질 수 있다.' },

  { id: 'sit-cases-list', typeId: 'sit-cases', name: '전체나열형', bestFor: '경우가 적을 때 안정적으로 세는 사람', cue: '가능한 조합을 빠짐없이 쓴다.', steps: ['첫 항목을 고정하고 조합을 나열한다.', '조건에 맞지 않는 것을 지운다.', '중복이 없는지 마지막에 본다.'], warning: '경우가 많아지면 폭발적으로 느려진다.' },
  { id: 'sit-cases-minus', typeId: 'sit-cases', name: '제외조건형', bestFor: '전체에서 빼는 계산이 편한 사람', cue: '전체 경우의 수에서 불가능을 뺀다.', steps: ['제한이 없을 때 전체를 센다.', '조건 위반 경우를 따로 센다.', '중복 제외가 생기는지 확인한다.'], warning: '위반 조건이 겹치면 중복 제거가 필요하다.' },
  { id: 'sit-cases-table', typeId: 'sit-cases', name: '조합표형', bestFor: '쌍 조합을 표로 체크하는 사람', cue: '행과 열로 조합을 만들어 가능한 칸만 센다.', steps: ['항목을 행/열에 배치한다.', '중복 칸과 자기 자신 칸을 제외한다.', '조건을 만족하는 칸만 센다.'], warning: '세 개 이상 조합에는 표가 복잡해질 수 있다.' },

  { id: 'sit-order-arrow', typeId: 'sit-order', name: '화살표 사슬형', bestFor: '앞뒤 관계를 선으로 연결하면 편한 사람', cue: 'A 앞 B를 화살표로 바꾼다.', steps: ['각 조건을 화살표로 번역한다.', '이어지는 화살표를 한 줄로 합친다.', '확정된 앞/뒤 관계만 선지에 적용한다.'], warning: '붙어 있음 조건은 화살표만으로 부족하다.' },
  { id: 'sit-order-block', typeId: 'sit-order', name: '묶음조건형', bestFor: '바로 앞/뒤 조건을 자주 놓치는 사람', cue: '붙어 있는 대상은 블록으로 묶는다.', steps: ['인접 조건을 하나의 블록으로 만든다.', '블록 내부 순서를 고정한다.', '블록을 하나의 대상처럼 배치한다.'], warning: '블록 방향이 뒤집히는지 반드시 확인해야 한다.' },
  { id: 'sit-order-end', typeId: 'sit-order', name: '양끝 고정형', bestFor: '첫째/마지막 조건이 보이면 빨라지는 사람', cue: '가장 앞과 뒤 후보부터 잠근다.', steps: ['첫 자리와 끝자리 조건을 찾는다.', '불가능한 후보를 제거한다.', '남은 중간 순서를 조건으로 채운다.'], warning: '양끝 조건이 없으면 억지로 쓰지 않는 편이 낫다.' },

  { id: 'logic-truefalse-assume', typeId: 'logic-truefalse', name: '가정법형', bestFor: '하나를 참으로 놓고 밀어보는 게 편한 사람', cue: '진술 하나를 참이라고 가정한다.', steps: ['첫 진술을 참으로 놓는다.', '다른 진술의 참거짓을 계산한다.', '문제의 참 개수 조건과 맞는지 본다.'], warning: '가정 가지가 많으면 시간이 늘어난다.' },
  { id: 'logic-truefalse-contradiction', typeId: 'logic-truefalse', name: '모순쌍형', bestFor: '서로 동시에 참일 수 없는 문장을 빨리 찾는 사람', cue: 'A와 not A 관계를 먼저 찾는다.', steps: ['직접 모순되는 진술쌍을 표시한다.', '참 개수 조건으로 후보를 줄인다.', '남은 진술을 검산한다.'], warning: '간접 모순은 한 번 더 추론해야 보인다.' },
  { id: 'logic-truefalse-table', typeId: 'logic-truefalse', name: '진리표형', bestFor: '논리식을 표로 정리해야 안정적인 사람', cue: '가능한 경우를 표로 나눈다.', steps: ['핵심 변수의 경우를 나열한다.', '각 진술의 참거짓을 채운다.', '조건에 맞는 행을 고른다.'], warning: '간단한 문제에서는 과하게 느릴 수 있다.' },

  { id: 'logic-proposition-arrow', typeId: 'logic-proposition', name: '화살표 번역형', bestFor: '문장을 기호로 바꾸면 편한 사람', cue: '조건문을 A -> B로 적는다.', steps: ['충분조건을 왼쪽, 필요한 결과를 오른쪽에 둔다.', '연결되는 중간항을 찾는다.', '이어지는 결론을 만든다.'], warning: '일상어의 필요/충분 방향을 반대로 쓰지 말아야 한다.' },
  { id: 'logic-proposition-contrapositive', typeId: 'logic-proposition', name: '대우형', bestFor: '부정 조건이 많은 문제에 강한 사람', cue: 'A -> B는 not B -> not A도 참이다.', steps: ['원 명제의 대우를 적는다.', '부정 정보와 연결되는지 본다.', '가능한 결론만 선지에 적용한다.'], warning: '역과 이는 참이라고 착각하면 안 된다.' },
  { id: 'logic-proposition-chain', typeId: 'logic-proposition', name: '연쇄형', bestFor: '여러 조건을 한 줄로 연결하는 사람', cue: 'A -> B -> C 사슬을 만든다.', steps: ['공통 항목을 기준으로 조건을 정렬한다.', '이어지는 화살표만 연결한다.', '시작점과 끝점을 결론으로 잡는다.'], warning: '중간 조건이 끊긴 곳을 억지로 이어서는 안 된다.' },

  { id: 'logic-necessary-translate', typeId: 'logic-necessary', name: '표현 번역형', bestFor: '한국어 표현에서 방향을 자주 헷갈리는 사람', cue: '~하려면, ~해야 한다를 화살표로 바꾼다.', steps: ['하려면 앞의 행동을 왼쪽에 둔다.', '해야 한다 뒤의 조건을 오른쪽에 둔다.', '왼쪽은 충분, 오른쪽은 필요로 표시한다.'], warning: '필요조건이라는 단어만 보고 방향을 정하면 위험하다.' },
  { id: 'logic-necessary-counter', typeId: 'logic-necessary', name: '반례형', bestFor: '문장이 참인지 예외로 확인하는 사람', cue: '선지가 틀릴 수 있는 사례를 찾는다.', steps: ['선지의 주장 방향을 화살표로 바꾼다.', '앞은 참인데 뒤가 거짓인 사례를 상상한다.', '반례가 가능하면 제거한다.'], warning: '반례가 안 떠오른다고 곧바로 참은 아니다.' },
  { id: 'logic-necessary-venn', typeId: 'logic-necessary', name: '벤다이어그램형', bestFor: '포함관계로 보면 편한 사람', cue: '충분조건 집합이 필요조건 집합 안에 들어간다.', steps: ['작은 집합과 큰 집합을 구분한다.', '선지의 포함 방향이 맞는지 본다.', '밖에 있는 사례가 가능한지 확인한다.'], warning: '조건이 셋 이상이면 그림이 지저분해질 수 있다.' },

  { id: 'logic-must-fixed', typeId: 'logic-must', name: '확정정보형', bestFor: '가능성과 확정을 구분하는 사람', cue: '반드시 참은 확정된 것만 고른다.', steps: ['조건에서 확정되는 관계만 표시한다.', '추정 또는 가능성은 따로 둔다.', '선지가 확정정보만으로 나오는지 확인한다.'], warning: '그럴듯해 보이는 가능성을 정답으로 고르기 쉽다.' },
  { id: 'logic-must-counter', typeId: 'logic-must', name: '반례검사형', bestFor: '선지를 하나씩 깨보는 게 빠른 사람', cue: '선지가 틀리는 배열이 가능한지 본다.', steps: ['선지를 임시 결론으로 둔다.', '그 반대 상황이 조건과 양립하는지 만든다.', '반례가 가능하면 반드시 참이 아니다.'], warning: '반례를 만드는 데 오래 걸리면 확정정보형으로 돌아간다.' },
  { id: 'logic-must-minmodel', typeId: 'logic-must', name: '최소모델형', bestFor: '작은 예시를 만들어 검증하는 사람', cue: '조건을 만족하는 가장 단순한 세계를 만든다.', steps: ['대상 수를 최소로 놓고 배치한다.', '조건을 모두 만족하게 조정한다.', '모든 모델에서 유지되는 결론만 고른다.'], warning: '한 모델에서 참이라고 반드시 참은 아니다.' },

  { id: 'logic-sequence-arrow', typeId: 'logic-sequence', name: '화살표 사슬형', bestFor: '순서 조건을 선으로 보는 사람', cue: '앞선다/뒤이다를 한 방향 화살표로 통일한다.', steps: ['모든 조건을 같은 방향으로 번역한다.', '이어지는 관계를 합친다.', '확정된 순서만 선지와 비교한다.'], warning: '동시 또는 인접 조건은 별도 표시가 필요하다.' },
  { id: 'logic-sequence-slot', typeId: 'logic-sequence', name: '슬롯형', bestFor: '자리 배치로 생각하면 편한 사람', cue: '1번부터 마지막 자리까지 칸을 만든다.', steps: ['확정 위치가 있는 대상을 먼저 넣는다.', '가능한 후보를 각 칸에 표시한다.', '조건 위반 후보를 지운다.'], warning: '대상 수가 많으면 칸 관리가 번거롭다.' },
  { id: 'logic-sequence-choice', typeId: 'logic-sequence', name: '선지 대입형', bestFor: '보기 순서가 완성 배열로 주어질 때 빠른 사람', cue: '선지 배열이 조건을 어기는지만 본다.', steps: ['각 선지를 하나의 순서표로 본다.', '조건을 위에서부터 대조한다.', '위반 조건이 보이면 즉시 제거한다.'], warning: '반드시 참을 묻는 문제와 혼동하지 않아야 한다.' },

  { id: 'logic-correspondence-matrix', typeId: 'logic-correspondence', name: 'O/X 매트릭스형', bestFor: '대응관계 문제를 표로 풀면 편한 사람', cue: '대상과 속성을 행열로 놓는다.', steps: ['확정 관계는 O로 표시한다.', '같은 행과 열의 나머지를 X 처리한다.', '남은 칸을 조건으로 채운다.'], warning: '표를 너무 크게 만들면 시간이 늘어난다.' },
  { id: 'logic-correspondence-fixed', typeId: 'logic-correspondence', name: '확정값 먼저형', bestFor: '단서에서 바로 정해지는 값을 잘 잡는 사람', cue: '단정 조건을 먼저 처리한다.', steps: ['A는 B이다 같은 조건을 먼저 고정한다.', '고정값이 만드는 제외를 반영한다.', '남은 대상끼리만 비교한다.'], warning: '부정 조건을 확정으로 착각하지 않아야 한다.' },
  { id: 'logic-correspondence-leftover', typeId: 'logic-correspondence', name: '남은값형', bestFor: '마지막 하나가 자동 확정되는 구조에 강한 사람', cue: '확정과 제외를 반복해 남는 값을 찾는다.', steps: ['각 대상의 불가능 값을 지운다.', '한 행/열에 하나만 남으면 확정한다.', '확정으로 생긴 새 제외를 반복한다.'], warning: '초반에 잘못 지운 X가 끝까지 영향을 준다.' },
];

const subjectLabels: Record<SubjectKey, string> = {
  data: '자료해석',
  situation: '상황판단',
  logic: '언어논리',
};

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : Number(raw);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function averageSeconds(stat?: TypeTimingStat): number {
  if (!stat || stat.attempts === 0) {
    return 0;
  }
  return Math.round(stat.totalSeconds / stat.attempts);
}

function methodsForType(typeId: string): SolutionMethod[] {
  return solutionMethods.filter((method) => method.typeId === typeId);
}

function comfortValue(rating?: ComfortRating): number {
  if (rating === 'easy') {
    return 3;
  }
  if (rating === 'neutral') {
    return 2;
  }
  if (rating === 'hard') {
    return 1;
  }
  return 2;
}

function comfortLabel(rating?: ComfortRating): string {
  if (rating === 'easy') {
    return '편함';
  }
  if (rating === 'neutral') {
    return '애매함';
  }
  if (rating === 'hard') {
    return '안 맞음';
  }
  return '미선택';
}

function subjectToneClass(subjectKey: SubjectKey): string {
  return `subject-tone-${subjectKey}`;
}

function difficultyLabel(difficulty: DifficultyLevel): string {
  return difficultyProfiles[difficulty].label;
}

function validDifficulty(value: string | null): DifficultyLevel {
  return value === 'beginner' || value === 'advanced' ? value : 'intermediate';
}

function withGenerationDifficulty<T>(difficulty: DifficultyLevel, action: () => T): T {
  const previous = activeGenerationDifficulty;
  activeGenerationDifficulty = difficulty;
  try {
    return action();
  } finally {
    activeGenerationDifficulty = previous;
  }
}

function buildMethodFitResults(
  plan: MethodTrial[],
  answers: Record<number, number>,
  spentSeconds: Record<number, number>,
  comfort: Record<number, ComfortRating>,
): MethodFitSummary[] {
  const grouped = new Map<string, {
    method: SolutionMethod;
    attempts: number;
    correct: number;
    totalSeconds: number;
    seconds: number[];
    comfortTotal: number;
  }>();

  plan.forEach((trial, index) => {
    const selected = answers[index];
    if (selected === undefined) {
      return;
    }
    const existing = grouped.get(trial.method.id) ?? {
      method: trial.method,
      attempts: 0,
      correct: 0,
      totalSeconds: 0,
      seconds: [],
      comfortTotal: 0,
    };
    const spent = spentSeconds[index] ?? 1;
    existing.attempts += 1;
    existing.correct += selected === trial.question.correctIndex ? 1 : 0;
    existing.totalSeconds += spent;
    existing.seconds.push(spent);
    existing.comfortTotal += comfortValue(comfort[index]);
    grouped.set(trial.method.id, existing);
  });

  const baseRows = Array.from(grouped.values()).map((row) => {
    const mean = row.totalSeconds / Math.max(1, row.attempts);
    const variance = row.seconds.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, row.seconds.length);
    const deviation = Math.sqrt(variance);
    const consistency = row.attempts <= 1
      ? 75
      : Math.max(0, Math.round((1 - Math.min(deviation / Math.max(1, mean), 1)) * 100));

    return {
      method: row.method,
      attempts: row.attempts,
      correct: row.correct,
      accuracy: Math.round((row.correct / Math.max(1, row.attempts)) * 100),
      totalSeconds: row.totalSeconds,
      avgSeconds: Math.round(mean),
      consistency,
      comfortScore: Math.round(((row.comfortTotal / Math.max(1, row.attempts)) - 1) * 50),
      score: 0,
      verdict: '',
    };
  });

  const fastestAverage = Math.min(...baseRows.map((row) => row.avgSeconds || 999));

  return baseRows.map((row) => {
    const speedScore = Math.min(100, Math.round((fastestAverage / Math.max(1, row.avgSeconds)) * 100));
    const comfortScore = Math.max(0, Math.min(100, row.comfortScore));
    let score = Math.round((row.accuracy * 0.5) + (speedScore * 0.25) + (row.consistency * 0.15) + (comfortScore * 0.1));
    if (row.accuracy < 50) {
      score = Math.min(score, 49);
    }

    let verdict = '보조 풀이로 보관';
    if (row.accuracy < 50) {
      verdict = '아직 주력으로 쓰기 위험';
    } else if (score >= 85) {
      verdict = '주력 풀이 후보';
    } else if (score >= 70) {
      verdict = '보험 풀이 후보';
    } else if (speedScore >= 90 && row.accuracy < 80) {
      verdict = '빠르지만 오답 위험';
    }

    return { ...row, score, verdict };
  }).sort((a, b) => b.score - a.score);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [trainingReturnTab, setTrainingReturnTab] = useState<TabKey>('home');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<'all' | SubjectKey>('all');
  const [systemTime, setSystemTime] = useState('09:41');
  const [isCourseBuilderOpen, setIsCourseBuilderOpen] = useState(false);
  const [isDifficultySheetOpen, setIsDifficultySheetOpen] = useState(false);
  const [difficultySheetMode, setDifficultySheetMode] = useState<DifficultySheetMode>('launch');
  const [pendingTrainingLaunch, setPendingTrainingLaunch] = useState<TrainingLaunchRequest | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>(() => validDifficulty(localStorage.getItem(STORAGE_KEYS.difficulty)));
  const [isDifficultyFixed, setIsDifficultyFixed] = useState(() => localStorage.getItem(STORAGE_KEYS.difficultyFixed) === 'true');
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(['logic-must', 'data-multiply']);
  const [quickTypeIds, setQuickTypeIds] = useState<string[]>(() => normalizeTrainingTypeIds(readJson(STORAGE_KEYS.quickTypes, defaultQuickTypeIds)));
  const [draftQuickTypeIds, setDraftQuickTypeIds] = useState<string[]>([]);
  const [isQuickTypeSettingsOpen, setIsQuickTypeSettingsOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(() => readNumber(STORAGE_KEYS.streak, 0));
  const [totalSolved, setTotalSolved] = useState(() => readNumber(STORAGE_KEYS.total, 0));
  const [accuracy, setAccuracy] = useState(() => readNumber(STORAGE_KEYS.accuracy, 0));
  const [todaySolvedCount, setTodaySolvedCount] = useState(() => readNumber(STORAGE_KEYS.todaySolved, 0));
  const [todayTime, setTodayTime] = useState(() => readNumber(STORAGE_KEYS.todayTime, 0));
  const [isAmoled, setIsAmoled] = useState(() => localStorage.getItem(STORAGE_KEYS.amoled) === 'true');
  const [isHapticEnabled, setIsHapticEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.haptic) !== 'false');
  const [incorrectNotes, setIncorrectNotes] = useState<IncorrectNote[]>(() => readJson(STORAGE_KEYS.incorrect, []));
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(() => readJson(STORAGE_KEYS.dailyResult, null));
  const [typeStats, setTypeStats] = useState<TypeStats>(() => readJson(STORAGE_KEYS.typeStats, {}));
  const [methodStats, setMethodStats] = useState<MethodStats>(() => readJson(STORAGE_KEYS.methodStats, {}));
  const [isExamActive, setIsExamActive] = useState(false);
  const [activeExamQuestions, setActiveExamQuestions] = useState<Question[]>([]);
  const [activeCourseTypes, setActiveCourseTypes] = useState<string[]>([]);
  const [activeExamDifficulty, setActiveExamDifficulty] = useState<DifficultyLevel | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [showResultsOverlay, setShowResultsOverlay] = useState(false);
  const [lastExamResult, setLastExamResult] = useState<DailyResult | null>(null);
  const [isMethodFinderOpen, setIsMethodFinderOpen] = useState(false);
  const [methodFinderStep, setMethodFinderStep] = useState<MethodFinderStep>('select-type');
  const [methodSubjectFilter, setMethodSubjectFilter] = useState<'all' | SubjectKey>('data');
  const [methodFinderTypeId, setMethodFinderTypeId] = useState('data-multiply');
  const [methodFinderPlan, setMethodFinderPlan] = useState<MethodTrial[]>([]);
  const [methodFinderIndex, setMethodFinderIndex] = useState(0);
  const [methodFinderAnswers, setMethodFinderAnswers] = useState<Record<number, number>>({});
  const [methodFinderSpent, setMethodFinderSpent] = useState<Record<number, number>>({});
  const [methodFinderComfort, setMethodFinderComfort] = useState<Record<number, ComfortRating>>({});
  const [methodQuestionStartedAt, setMethodQuestionStartedAt] = useState(Date.now());
  const [methodElapsedSeconds, setMethodElapsedSeconds] = useState(0);

  const filteredTrainingTypes = useMemo(() => (
    selectedSubjectFilter === 'all'
      ? trainingTypes
      : trainingTypes.filter((type) => type.subjectKey === selectedSubjectFilter)
  ), [selectedSubjectFilter]);

  const selectedTypes = useMemo(() => (
    selectedTypeIds
      .map((id) => trainingTypes.find((type) => type.id === id))
      .filter((type): type is TrainingType => Boolean(type))
  ), [selectedTypeIds]);

  const quickTypes = useMemo(() => (
    quickTypeIds
      .map((id) => trainingTypes.find((type) => type.id === id))
      .filter((type): type is TrainingType => Boolean(type))
  ), [quickTypeIds]);

  const methodFinderTypes = useMemo(() => (
    trainingTypes.filter((type) => methodsForType(type.id).length > 0)
  ), []);

  const filteredMethodFinderTypes = useMemo(() => (
    methodSubjectFilter === 'all'
      ? methodFinderTypes
      : methodFinderTypes.filter((type) => type.subjectKey === methodSubjectFilter)
  ), [methodFinderTypes, methodSubjectFilter]);

  const methodFinderType = useMemo(() => (
    methodFinderTypes.find((type) => type.id === methodFinderTypeId) ?? methodFinderTypes[0]
  ), [methodFinderTypeId, methodFinderTypes]);

  const methodFinderMethods = useMemo(() => (
    methodFinderType ? methodsForType(methodFinderType.id) : []
  ), [methodFinderType]);

  const methodFitResults = useMemo(() => (
    buildMethodFitResults(methodFinderPlan, methodFinderAnswers, methodFinderSpent, methodFinderComfort)
  ), [methodFinderPlan, methodFinderAnswers, methodFinderSpent, methodFinderComfort]);

  const bestSavedMethod = useMemo(() => (
    Object.entries(methodStats)
      .map(([methodId, stat]) => ({ method: solutionMethods.find((item) => item.id === methodId), stat }))
      .filter((item): item is { method: SolutionMethod; stat: MethodFitStat } => Boolean(item.method))
      .sort((a, b) => b.stat.lastScore - a.stat.lastScore)[0]
  ), [methodStats]);

  const incorrectTypeGroups = useMemo(() => {
    const groups = new Map<string, IncorrectTypeGroup>();

    incorrectNotes.forEach((note) => {
      const type = trainingTypes.find((item) => item.id === note.question.typeId);
      const subjectKey = type?.subjectKey
        ?? (note.subject === '자료해석' ? 'data' : note.subject === '상황판단' ? 'situation' : 'logic');
      const title = type?.name ?? note.title;
      const key = `${note.question.typeId}-${title}`;
      const previous = groups.get(key);

      if (previous) {
        previous.count += 1;
        previous.questions.push(note.question);
        return;
      }

      groups.set(key, {
        key,
        subjectKey,
        subject: type?.subject ?? note.subject,
        title,
        typeId: note.question.typeId,
        count: 1,
        questions: [note.question],
      });
    });

    return Array.from(groups.values()).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ko-KR'));
  }, [incorrectNotes]);

  const routineProgressPercent = Math.min(100, Math.round((todaySolvedCount / 12) * 100));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.streak, streakCount.toString());
    localStorage.setItem(STORAGE_KEYS.total, totalSolved.toString());
    localStorage.setItem(STORAGE_KEYS.accuracy, accuracy.toString());
    localStorage.setItem(STORAGE_KEYS.todaySolved, todaySolvedCount.toString());
    localStorage.setItem(STORAGE_KEYS.todayTime, todayTime.toString());
    localStorage.setItem(STORAGE_KEYS.incorrect, JSON.stringify(incorrectNotes));
    localStorage.setItem(STORAGE_KEYS.dailyResult, JSON.stringify(dailyResult));
    localStorage.setItem(STORAGE_KEYS.typeStats, JSON.stringify(typeStats));
    localStorage.setItem(STORAGE_KEYS.methodStats, JSON.stringify(methodStats));
  }, [streakCount, totalSolved, accuracy, todaySolvedCount, todayTime, incorrectNotes, dailyResult, typeStats, methodStats]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.amoled, isAmoled.toString());
    document.body.classList.toggle('amoled-mode', isAmoled);
  }, [isAmoled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.haptic, isHapticEnabled.toString());
  }, [isHapticEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.difficulty, selectedDifficulty);
    localStorage.setItem(STORAGE_KEYS.difficultyFixed, isDifficultyFixed.toString());
  }, [selectedDifficulty, isDifficultyFixed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.quickTypes, JSON.stringify(quickTypeIds));
  }, [quickTypeIds]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setSystemTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const scrollSurfaceSelector = [
      '.app-scrollable-body',
      '.horizontal-carousel',
      '.horizontal-chips-bar',
      '.bottom-sheet-content',
      '.course-builder-sheet',
      '.quiz-scrollable-body',
      '.quiz-table-wrapper',
      '.method-finder-body',
      '.method-type-grid',
      '.omr-questions-grid',
    ].join(', ');

    let dragState: {
      element: HTMLElement;
      originTarget: HTMLElement;
      startX: number;
      startY: number;
      scrollLeft: number;
      scrollTop: number;
      dragged: boolean;
    } | null = null;
    let suppressNextClick = false;

    const canScrollOnAxis = (element: HTMLElement, axis?: 'x' | 'y') => {
      const canScrollX = element.scrollWidth > element.clientWidth + 2;
      const canScrollY = element.scrollHeight > element.clientHeight + 2;
      if (axis === 'x') {
        return canScrollX;
      }
      if (axis === 'y') {
        return canScrollY;
      }
      return canScrollX || canScrollY;
    };

    const findScrollElement = (target: HTMLElement, axis?: 'x' | 'y') => {
      let current = target.closest(scrollSurfaceSelector) as HTMLElement | null;
      while (current) {
        if (canScrollOnAxis(current, axis)) {
          return current;
        }
        current = current.parentElement?.closest(scrollSurfaceSelector) as HTMLElement | null;
      }
      return null;
    };

    const endDrag = () => {
      if (!dragState) {
        return;
      }

      if (dragState.dragged) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }

      dragState.element.classList.remove('drag-scroll-active');
      document.body.classList.remove('drag-scroll-lock');
      dragState = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target || target.closest('input, textarea, select, option')) {
        return;
      }

      const scrollElement = findScrollElement(target);
      if (!scrollElement) {
        return;
      }

      dragState = {
        element: scrollElement,
        originTarget: target,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scrollElement.scrollLeft,
        scrollTop: scrollElement.scrollTop,
        dragged: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.dragged && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }

      if (!dragState.dragged) {
        const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        const directionalElement = findScrollElement(dragState.originTarget, axis);
        if (directionalElement && directionalElement !== dragState.element) {
          dragState.element = directionalElement;
          dragState.startX = event.clientX;
          dragState.startY = event.clientY;
          dragState.scrollLeft = directionalElement.scrollLeft;
          dragState.scrollTop = directionalElement.scrollTop;
        }
        dragState.dragged = true;
        dragState.element.classList.add('drag-scroll-active');
        document.body.classList.add('drag-scroll-lock');
      }

      event.preventDefault();
      const activeDeltaX = event.clientX - dragState.startX;
      const activeDeltaY = event.clientY - dragState.startY;
      if (canScrollOnAxis(dragState.element, 'x')) {
        dragState.element.scrollLeft = dragState.scrollLeft - activeDeltaX;
      }
      if (canScrollOnAxis(dragState.element, 'y')) {
        dragState.element.scrollTop = dragState.scrollTop - activeDeltaY;
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  useEffect(() => {
    if (!isExamActive) {
      return undefined;
    }
    if (secondsLeft <= 0) {
      handleExamSubmit();
      return undefined;
    }
    const timer = window.setInterval(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => window.clearInterval(timer);
  }, [isExamActive, secondsLeft]);

  useEffect(() => {
    if (!isMethodFinderOpen || methodFinderStep !== 'trial') {
      return undefined;
    }

    const updateElapsed = () => {
      setMethodElapsedSeconds(Math.max(0, Math.round((Date.now() - methodQuestionStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(timer);
  }, [isMethodFinderOpen, methodFinderStep, methodQuestionStartedAt]);

  const triggerHaptic = () => {
    if (isHapticEnabled && window.navigator.vibrate) {
      window.navigator.vibrate(24);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const toggleTrainingType = (typeId: string) => {
    triggerHaptic();
    setSelectedTypeIds((prev) => (
      prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId]
    ));
  };

  const openQuickTypeSettings = () => {
    triggerHaptic();
    setDraftQuickTypeIds(quickTypeIds);
    setIsQuickTypeSettingsOpen(true);
  };

  const toggleQuickTrainingType = (typeId: string) => {
    triggerHaptic();
    setDraftQuickTypeIds((prev) => (
      prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId]
    ));
  };

  const confirmQuickTypeSettings = () => {
    if (draftQuickTypeIds.length === 0) {
      return;
    }

    triggerHaptic();
    setQuickTypeIds(normalizeTrainingTypeIds(draftQuickTypeIds));
    setIsQuickTypeSettingsOpen(false);
  };

  const getPerTypeCount = (types: TrainingType[], difficulty: DifficultyLevel): number => {
    const base = types.length <= 2 ? 3 : types.length <= 4 ? 2 : 1;
    return Math.max(1, Math.min(5, base + difficultyProfiles[difficulty].perTypeOffset));
  };

  const getTrainingSeconds = (questionCount: number, difficulty: DifficultyLevel): number => (
    Math.max(difficultyProfiles[difficulty].minSeconds, questionCount * difficultyProfiles[difficulty].secondsPerQuestion)
  );

  const buildCourseQuestions = (types: TrainingType[], difficulty: DifficultyLevel): Question[] => {
    const perType = getPerTypeCount(types, difficulty);
    return shuffle(types.flatMap((type) => (
      Array.from({ length: perType }, () => withGenerationDifficulty(difficulty, () => type.generator()))
    )));
  };

  const estimateCourseCount = (types: TrainingType[]): number => {
    const perType = getPerTypeCount(types, selectedDifficulty);
    return types.length * perType;
  };

  const openCourseBuilder = () => {
    triggerHaptic();
    setIsCourseBuilderOpen(true);
  };

  const executeTrainingLaunch = (launch: TrainingLaunchRequest, difficulty: DifficultyLevel) => {
    if (launch.types.length === 0) {
      return;
    }

    triggerHaptic();
    setSelectedDifficulty(difficulty);
    const questions = buildCourseQuestions(launch.types, difficulty);
    setActiveExamQuestions(questions);
    setActiveCourseTypes(launch.types.map((type) => type.name));
    setActiveExamDifficulty(difficulty);
    setSelectedAnswers({});
    setCurrentQIndex(0);
    setSecondsLeft(getTrainingSeconds(questions.length, difficulty));
    setQuestionStartedAt(Date.now());
    setIsExamActive(true);
    setIsCourseBuilderOpen(false);
    setIsDifficultySheetOpen(false);
    setPendingTrainingLaunch(null);
  };

  const requestTrainingLaunch = (launch: TrainingLaunchRequest) => {
    if (launch.types.length === 0) {
      return;
    }

    setTrainingReturnTab(activeTab);

    if (isDifficultyFixed) {
      executeTrainingLaunch(launch, selectedDifficulty);
      return;
    }

    triggerHaptic();
    setPendingTrainingLaunch(launch);
    setDifficultySheetMode('launch');
    setIsDifficultySheetOpen(true);
  };

  const startDailyCourse = () => {
    requestTrainingLaunch({ kind: 'daily', types: selectedTypes });
  };

  const startSingleType = (type: TrainingType) => {
    setSelectedTypeIds([type.id]);
    requestTrainingLaunch({ kind: 'single', types: [type] });
  };

  const startQuestionCourse = (questions: Question[], courseName: string, seconds = 300) => {
    if (questions.length === 0) {
      return;
    }

    triggerHaptic();
    setTrainingReturnTab(activeTab);
    setActiveExamQuestions(questions);
    setActiveCourseTypes([courseName]);
    setActiveExamDifficulty(null);
    setSelectedAnswers({});
    setCurrentQIndex(0);
    setSecondsLeft(seconds);
    setQuestionStartedAt(Date.now());
    setIsExamActive(true);
  };

  const startMistakeCourse = () => {
    if (incorrectNotes.length === 0) {
      setActiveTab('notes');
      return;
    }
    startQuestionCourse(shuffle(incorrectNotes).slice(0, 8).map((note) => note.question), '오답 랜덤');
  };

  const startIncorrectTypeCourse = (group: IncorrectTypeGroup) => {
    startQuestionCourse(shuffle(group.questions).slice(0, 8), `${group.subject} - ${group.title}`);
  };

  const openDifficultySettings = () => {
    triggerHaptic();
    setPendingTrainingLaunch(null);
    setDifficultySheetMode('settings');
    setIsDifficultySheetOpen(true);
  };

  const handleDifficultyChoice = (difficulty: DifficultyLevel) => {
    triggerHaptic();
    setSelectedDifficulty(difficulty);
    if (difficultySheetMode === 'launch' && pendingTrainingLaunch) {
      executeTrainingLaunch(pendingTrainingLaunch, difficulty);
    }
  };

  const handleClearIncorrectNotes = () => {
    triggerHaptic();
    if (!window.confirm('오답노트를 모두 비울까요?')) {
      return;
    }
    setIncorrectNotes([]);
  };

  const openMethodFinder = () => {
    triggerHaptic();
    setIsMethodFinderOpen(true);
    setMethodFinderStep('select-type');
    setMethodFinderPlan([]);
    setMethodFinderIndex(0);
    setMethodFinderAnswers({});
    setMethodFinderSpent({});
    setMethodFinderComfort({});
  };

  const closeMethodFinder = () => {
    triggerHaptic();
    setIsMethodFinderOpen(false);
    setMethodFinderStep('select-type');
  };

  const startMethodDiagnostic = (typeId = methodFinderTypeId) => {
    const type = trainingTypes.find((item) => item.id === typeId);
    if (!type) {
      return;
    }
    const methods = methodsForType(type.id).slice(0, 3);
    if (methods.length === 0) {
      return;
    }

    triggerHaptic();
    const plan = shuffle(methods.flatMap((method) => (
      Array.from({ length: 2 }, () => ({ question: type.generator(), method }))
    )));

    setMethodFinderTypeId(type.id);
    setMethodFinderPlan(plan);
    setMethodFinderIndex(0);
    setMethodFinderAnswers({});
    setMethodFinderSpent({});
    setMethodFinderComfort({});
    setMethodElapsedSeconds(0);
    setMethodQuestionStartedAt(Date.now());
    setMethodFinderStep('trial');
  };

  const handleSelectMethodOption = (trialIndex: number, optionIndex: number) => {
    if (methodFinderAnswers[trialIndex] !== undefined) {
      return;
    }

    const trial = methodFinderPlan[trialIndex];
    if (!trial) {
      return;
    }

    triggerHaptic();
    const spent = Math.max(1, Math.round((Date.now() - methodQuestionStartedAt) / 1000));
    setMethodFinderAnswers((prev) => ({ ...prev, [trialIndex]: optionIndex }));
    setMethodFinderSpent((prev) => ({ ...prev, [trialIndex]: spent }));
    window.setTimeout(() => {
      document.querySelector('.method-trial-body')?.scrollTo({
        top: document.querySelector('.method-trial-body')?.scrollHeight ?? 0,
        behavior: 'smooth',
      });
    }, 40);
  };

  const handleMethodComfort = (trialIndex: number, rating: ComfortRating) => {
    triggerHaptic();
    setMethodFinderComfort((prev) => ({ ...prev, [trialIndex]: rating }));
  };

  const finishMethodDiagnostic = () => {
    const results = buildMethodFitResults(methodFinderPlan, methodFinderAnswers, methodFinderSpent, methodFinderComfort);
    if (results.length === 0) {
      setMethodFinderStep('select-type');
      return;
    }

    triggerHaptic();
    setMethodStats((prev) => {
      const next = { ...prev };
      const triedAt = new Date().toISOString();

      results.forEach((result) => {
        const previous = next[result.method.id] ?? {
          attempts: 0,
          correct: 0,
          totalSeconds: 0,
          comfortTotal: 0,
          sessions: 0,
          bestScore: 0,
          lastScore: 0,
          lastTriedAt: triedAt,
        };

        next[result.method.id] = {
          attempts: previous.attempts + result.attempts,
          correct: previous.correct + result.correct,
          totalSeconds: previous.totalSeconds + result.totalSeconds,
          comfortTotal: previous.comfortTotal + Math.round((result.comfortScore / 50 + 1) * result.attempts),
          sessions: previous.sessions + 1,
          bestScore: Math.max(previous.bestScore, result.score),
          lastScore: result.score,
          lastTriedAt: triedAt,
        };
      });

      return next;
    });
    setMethodFinderStep('result');
  };

  const goToNextMethodTrial = () => {
    if (methodFinderIndex >= methodFinderPlan.length - 1) {
      finishMethodDiagnostic();
      return;
    }

    triggerHaptic();
    setMethodFinderIndex((prev) => prev + 1);
    setMethodElapsedSeconds(0);
    setMethodQuestionStartedAt(Date.now());
  };

  const handleSelectOption = (qIdx: number, oIdx: number) => {
    if (selectedAnswers[qIdx] !== undefined) {
      return;
    }

    const question = activeExamQuestions[qIdx];
    if (!question) {
      return;
    }

    triggerHaptic();
    const spentSeconds = Math.max(1, Math.round((Date.now() - questionStartedAt) / 1000));
    const isCorrect = oIdx === question.correctIndex;

    setTypeStats((prev) => {
      const previous = prev[question.typeId] ?? {
        attempts: 0,
        correct: 0,
        totalSeconds: 0,
        bestSeconds: 0,
        lastSeconds: 0,
      };

      const bestSeconds = previous.bestSeconds === 0
        ? spentSeconds
        : Math.min(previous.bestSeconds, spentSeconds);

      return {
        ...prev,
        [question.typeId]: {
          attempts: previous.attempts + 1,
          correct: previous.correct + (isCorrect ? 1 : 0),
          totalSeconds: previous.totalSeconds + spentSeconds,
          bestSeconds,
          lastSeconds: spentSeconds,
        },
      };
    });

    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: oIdx }));
  };

  const goToQuestion = (nextIndex: number) => {
    triggerHaptic();
    setCurrentQIndex(nextIndex);
    setQuestionStartedAt(Date.now());
  };

  const exitTrainingToHome = () => {
    triggerHaptic();
    setIsExamActive(false);
    setActiveTab('home');
  };

  const exitTrainingToPreviousPage = () => {
    triggerHaptic();
    setIsExamActive(false);
    setActiveTab(trainingReturnTab);
  };

  const goToPreviousQuestionOrPage = () => {
    if (currentQIndex === 0) {
      exitTrainingToPreviousPage();
      return;
    }

    goToQuestion(currentQIndex - 1);
  };

  function handleExamSubmit() {
    if (activeExamQuestions.length === 0) {
      setIsExamActive(false);
      return;
    }

    triggerHaptic();
    let correctCount = 0;
    const nextIncorrect = [...incorrectNotes];

    activeExamQuestions.forEach((question, index) => {
      const selected = selectedAnswers[index];
      if (selected === question.correctIndex) {
        correctCount += 1;
        return;
      }

      if (!nextIncorrect.some((note) => note.question.id === question.id)) {
        nextIncorrect.unshift({
          id: uid('wrong'),
          subject: question.subject,
          title: question.typeName,
          date: '방금 오답',
          tags: ['유형 복습'],
          question,
        });
      }
    });

    const result: DailyResult = {
      correct: correctCount,
      total: activeExamQuestions.length,
      accuracy: Math.round((correctCount / activeExamQuestions.length) * 100),
      selectedTypes: activeCourseTypes,
      completedAt: new Date().toISOString(),
    };

    setTotalSolved((prev) => prev + activeExamQuestions.length);
    setTodaySolvedCount((prev) => Math.min(12, prev + activeExamQuestions.length));
    setTodayTime((prev) => prev + Math.max(1, Math.ceil((Math.max(240, activeExamQuestions.length * 45) - secondsLeft) / 60)));
    setAccuracy((prev) => (prev === 0 ? result.accuracy : Math.round((prev * 7 + result.accuracy * 3) / 10)));
    setStreakCount((prev) => (result.accuracy >= 70 ? prev + 1 : 0));
    setIncorrectNotes(nextIncorrect.slice(0, 80));
    setDailyResult(result);
    setLastExamResult(result);
    setIsExamActive(false);
    setShowResultsOverlay(true);
  }

  const handleExportBackup = () => {
    triggerHaptic();
    const backupData: BackupData = {
      streakCount,
      totalSolved,
      accuracy,
      todaySolvedCount,
      todayTime,
      incorrectNotes,
      typeStats,
      methodStats,
      selectedDifficulty,
      difficultyFixed: isDifficultyFixed,
      quickTypeIds,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
    const anchor = document.createElement('a');
    anchor.setAttribute('href', jsonString);
    anchor.setAttribute('download', `psat4u_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleImportBackup = (event: ChangeEvent<HTMLInputElement>) => {
    triggerHaptic();
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(String(loadEvent.target?.result)) as Partial<BackupData>;
        setStreakCount(Number(parsed.streakCount ?? 0));
        setTotalSolved(Number(parsed.totalSolved ?? 0));
        setAccuracy(Number(parsed.accuracy ?? 0));
        setTodaySolvedCount(Number(parsed.todaySolvedCount ?? 0));
        setTodayTime(Number(parsed.todayTime ?? 0));
        setIncorrectNotes(Array.isArray(parsed.incorrectNotes) ? parsed.incorrectNotes : []);
        setTypeStats(parsed.typeStats ?? {});
        setMethodStats(parsed.methodStats ?? {});
        setSelectedDifficulty(validDifficulty(parsed.selectedDifficulty ?? 'intermediate'));
        setIsDifficultyFixed(Boolean(parsed.difficultyFixed));
        setQuickTypeIds(normalizeTrainingTypeIds(parsed.quickTypeIds, defaultQuickTypeIds));
      } catch {
        window.alert('백업 파일을 읽지 못했습니다.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    triggerHaptic();
    if (!window.confirm('모든 학습 기록과 오답노트를 초기화할까요?')) {
      return;
    }
    setStreakCount(0);
    setTotalSolved(0);
    setAccuracy(0);
    setTodaySolvedCount(0);
    setTodayTime(0);
    setIncorrectNotes([]);
    setDailyResult(null);
    setTypeStats({});
    setMethodStats({});
    setSelectedDifficulty('intermediate');
    setIsDifficultyFixed(false);
    setQuickTypeIds(defaultQuickTypeIds);
  };

  const currentQuestion = activeExamQuestions[currentQIndex];
  const currentAnswer = selectedAnswers[currentQIndex];
  const isCurrentAnswered = currentAnswer !== undefined;
  const currentTypeStat = currentQuestion ? typeStats[currentQuestion.typeId] : undefined;
  const remainingQuestions = Math.max(0, activeExamQuestions.length - currentQIndex - 1);
  const currentMethodTrial = methodFinderPlan[methodFinderIndex];
  const currentMethodAnswer = methodFinderAnswers[methodFinderIndex];
  const isCurrentMethodAnswered = currentMethodAnswer !== undefined;
  const currentMethodComfort = methodFinderComfort[methodFinderIndex];
  const primaryMethodResult = methodFitResults[0];
  const backupMethodResult = methodFitResults.find((result) => result.method.id !== primaryMethodResult?.method.id && result.accuracy >= 50) ?? methodFitResults[1];
  const recordLabel = (typeId: string) => {
    const stat = typeStats[typeId];
    return stat ? `최고 ${stat.bestSeconds}초` : '기록 없음';
  };

  return (
    <div className={`mobile-mockup-wrapper ${isAmoled ? 'amoled-mode' : ''}`}>
      <div className="smartphone-bezel">
        <div className="smartphone-notch">
          <div className="notch-lens" />
          <div className="notch-speaker" />
        </div>

        <div className="smartphone-status-bar">
          <span className="status-time">{systemTime}</span>
          <div className="status-bar-right">
            <Signal size={12} className="status-icon-item" />
            <Wifi size={12} className="status-icon-item" />
            <div className="battery-display">
              <span style={{ fontSize: '7px', fontWeight: 'bold', marginRight: '2.5px' }}>96%</span>
              <Battery size={14} className="status-icon-item" />
            </div>
          </div>
        </div>

        <div className="app-screen-container">
          <header className="app-header">
            <div className="app-logo">
              <span className="logo-main-text">PSAT4U</span>
              <span className="logo-badge">Offline Drill</span>
            </div>
            <button className="streak-flame-chip" type="button" onClick={() => setStreakCount((prev) => prev + 1)}>
              <Flame size={14} fill="currentColor" />
              <span>{streakCount}일</span>
            </button>
          </header>

          <div className="app-scrollable-body">
            {activeTab === 'home' && (
              <div className="subpage-container animate-fade">
                <div className="dashboard-overview-card routine-dashboard-card">
                  <div className="routine-info-panel">
                    <span className="routine-kicker">틈새 루틴</span>
                    <h4>오늘 훈련 대기 중</h4>
                    <p>자동채점 유형만 빠르게 돌리고, 기록은 유형별 속도로 남깁니다.</p>
                    <div className="routine-stats-strip">
                      <div className="routine-mini-stat">
                        <span>{todaySolvedCount}/12</span>
                        <small>오늘 문제</small>
                      </div>
                      <div className="routine-mini-stat">
                        <span>{totalSolved}제</span>
                        <small>누적</small>
                      </div>
                      <div className="routine-mini-stat">
                        <span>{accuracy}%</span>
                        <small>정답률</small>
                      </div>
                    </div>
                    <div className="routine-action-row">
                      <button className="routine-primary-btn" type="button" onClick={openCourseBuilder}>
                        <Zap size={13} />
                        오늘 훈련 시작
                      </button>
                      <button className="routine-secondary-btn" type="button" onClick={() => setActiveTab('training')}>
                        유형 보기
                      </button>
                    </div>
                  </div>

                  <div className="routine-orbit-panel" aria-hidden="true">
                    <div className="routine-orbit-ring">
                      <span className="routine-orbit-core">{routineProgressPercent}%</span>
                    </div>
                    <span className="routine-orbit-caption">AUTO DRILL</span>
                  </div>
                </div>

                <button className="advisor-banner daily-training-launch" type="button" onClick={openCourseBuilder}>
                  <Sparkles size={18} className="advisor-icon animate-float" />
                  <div className="advisor-desc">
                    <strong>오늘의 PSAT 훈련 시작</strong>
                    <p>논리퀴즈, 곱연산처럼 원하는 유형만 체크해서 5분 코스를 만듭니다.</p>
                  </div>
                  <ArrowRight size={16} className="trigger-action-arrow" />
                </button>

                {dailyResult && (
                  <div className="premium-glass-card daily-complete-card">
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>최근 일일훈련 완료</strong>
                      <p>{dailyResult.correct}/{dailyResult.total} 정답 · {dailyResult.selectedTypes.join(', ')}</p>
                    </div>
                  </div>
                )}

                <div className="carousel-section">
                  <div className="section-header quick-section-header">
                    <div className="section-title-group">
                      <h5><Bookmark size={14} style={{ color: 'var(--primary-light)' }} /> 즐겨찾는 훈련</h5>
                      <span>{quickTypes.length}개 바로 시작</span>
                    </div>
                    <button className="section-icon-btn" type="button" onClick={openQuickTypeSettings} aria-label="즐겨찾는 훈련 설정">
                      <Settings size={14} />
                    </button>
                  </div>
                  <div className="horizontal-carousel">
                    {quickTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          className={`premium-glass-card carousel-card card-subj-${type.subjectKey === 'data' ? 'data' : type.subjectKey === 'logic' ? 'lang' : 'situ'} ${subjectToneClass(type.subjectKey)}`}
                          onClick={() => startSingleType(type)}
                        >
                          <div className="card-icon-wrapper">
                            <Icon size={18} />
                          </div>
                          <div className="card-content">
                            <h6>{type.name}</h6>
                            <p>{type.desc}</p>
                          </div>
                          <div className="card-meta-line">
                            <span>{type.subject}</span>
                            <span className="card-meta-val">{recordLabel(type.id)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {quickTypes.length === 0 && (
                      <button className="premium-glass-card carousel-card quick-empty-card" type="button" onClick={openQuickTypeSettings}>
                        <div className="card-icon-wrapper">
                          <Settings size={18} />
                        </div>
                        <div className="card-content">
                          <h6>훈련 선택</h6>
                          <p>메인에서 바로 시작할 유형을 골라주세요.</p>
                        </div>
                        <div className="card-meta-line">
                          <span>설정 필요</span>
                          <span className="card-meta-val">0개</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                <div className="action-triggers-section">
                  <h5 className="mobile-sec-title">오프라인 트레이닝</h5>
                  <div className="action-triggers-list">
                    <button className="premium-glass-card action-trigger-bar trigger-exam" type="button" onClick={() => setActiveTab('training')}>
                      <div className="trigger-left">
                        <div className="trigger-icon-box"><Compass size={18} /></div>
                        <div className="trigger-info">
                          <h6>전체 유형 보기</h6>
                          <p>자료해석, 상황판단, 논리파트 전부 확인</p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="trigger-action-arrow" />
                    </button>

                    <button className="premium-glass-card action-trigger-bar trigger-method" type="button" onClick={openMethodFinder}>
                      <div className="trigger-left">
                        <div className="trigger-icon-box"><Sparkles size={18} /></div>
                        <div className="trigger-info">
                          <h6>나에게 맞는 풀이 찾기</h6>
                          <p>
                            {bestSavedMethod
                              ? `최근 추천 ${bestSavedMethod.method.name} · 적합도 ${bestSavedMethod.stat.lastScore}점`
                              : '풀이법 A/B 테스트로 주력 풀이 확인'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="trigger-action-arrow" />
                    </button>

                    <button className="premium-glass-card action-trigger-bar trigger-notes" type="button" onClick={startMistakeCourse}>
                      <div className="trigger-left">
                        <div className="trigger-icon-box"><Bookmark size={18} /></div>
                        <div className="trigger-info">
                          <h6>오답 재도전</h6>
                          <p>저장된 오답 중 랜덤으로 다시 풀기</p>
                        </div>
                      </div>
                      <span className="badge-count">{incorrectNotes.length}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'training' && (
              <div className="subpage-container animate-slide">
                <div className="subpage-meta training-meta-row">
                  <div>
                    <span>Course Library</span>
                    <h4>유형별 자동채점 훈련</h4>
                    <p>무료 방치형 앱에 넣기 좋은 유형만 모았습니다.</p>
                  </div>
                  <button className="difficulty-settings-btn" type="button" onClick={openDifficultySettings}>
                    <Sliders size={13} />
                    <span>{difficultyLabel(selectedDifficulty)}{isDifficultyFixed ? ' 고정' : ''}</span>
                  </button>
                </div>

                <div className="horizontal-chips-bar">
                  {(['all', 'data', 'situation', 'logic'] as const).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`filter-pill-chip ${selectedSubjectFilter === chip ? 'filter-pill-chip-active' : ''}`}
                      onClick={() => setSelectedSubjectFilter(chip)}
                    >
                      {chip === 'all' ? '전체' : subjectLabels[chip]}
                    </button>
                  ))}
                </div>

                <div className="subtopics-grid training-library-grid">
                  {filteredTrainingTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button className={`subtopic-item-card ${subjectToneClass(type.subjectKey)}`} type="button" key={type.id} onClick={() => startSingleType(type)}>
                        <div className="training-type-title-row">
                          <Icon size={15} />
                          <div className="subtopic-card-title">{type.name}</div>
                        </div>
                        <div className="subtopic-card-desc">{type.desc}</div>
                        <div className="subtopic-record-line">{recordLabel(type.id)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="subpage-container animate-fade">
                <div className="subpage-meta">
                  <span>Wrong Answer Clinic</span>
                  <h4>오답노트</h4>
                  <p>일일훈련에서 틀린 문제만 자동 저장됩니다.</p>
                </div>

                {incorrectNotes.length === 0 ? (
                  <div className="premium-glass-card empty-illustration-box">
                    <Trophy size={36} color="var(--success)" />
                    <h5>아직 오답이 없습니다.</h5>
                    <p>훈련을 끝내면 틀린 문제만 여기에 쌓입니다.</p>
                  </div>
                ) : (
                  <>
                    <div className="notes-actions-row">
                      <button className="premium-glass-card notes-random-launch" type="button" onClick={startMistakeCourse}>
                        <div className="trigger-left">
                          <div className="trigger-icon-box"><RotateCcw size={18} /></div>
                          <div className="trigger-info">
                            <h6>오답 랜덤 풀기</h6>
                            <p>저장된 오답에서 최대 8문제 랜덤 출제</p>
                          </div>
                        </div>
                        <span className="badge-count">{incorrectNotes.length}</span>
                      </button>
                      <button className="notes-clear-btn" type="button" onClick={handleClearIncorrectNotes} aria-label="오답 비우기">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="notes-type-list">
                      {incorrectTypeGroups.map((group) => (
                        <button
                          key={group.key}
                          className={`note-type-row ${subjectToneClass(group.subjectKey)}`}
                          type="button"
                          onClick={() => startIncorrectTypeCourse(group)}
                        >
                          <span className="note-type-dot" />
                          <strong>{group.subject} - {group.title}</strong>
                          <span>{group.count}문제</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="subpage-container animate-slide">
                <div className="subpage-meta">
                  <span>Offline Control</span>
                  <h4>설정</h4>
                  <p>서버 없이 기기 안에서만 저장됩니다.</p>
                </div>

                <div className="settings-menu-list">
                  <div className="premium-glass-card settings-section-card">
                    <span className="settings-section-title">백업</span>
                    <div className="settings-row-item">
                      <div className="settings-row-left">
                        <span className="settings-row-label">JSON 백업 내보내기</span>
                        <span className="settings-row-desc">오답과 통계를 파일로 저장</span>
                      </div>
                      <button className="settings-btn-action" type="button" onClick={handleExportBackup}><Download size={14} /></button>
                    </div>
                    <hr className="sheet-divider" />
                    <div className="settings-row-item">
                      <div className="settings-row-left">
                        <span className="settings-row-label">JSON 백업 가져오기</span>
                        <span className="settings-row-desc">저장한 파일로 복구</span>
                      </div>
                      <label className="settings-btn-action">
                        <Upload size={14} />
                        <input type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportBackup} />
                      </label>
                    </div>
                  </div>

                  <div className="premium-glass-card settings-section-card">
                    <span className="settings-section-title">앱 환경</span>
                    <div className="settings-row-item">
                      <div className="settings-row-left">
                        <span className="settings-row-label">AMOLED Pure Black</span>
                        <span className="settings-row-desc">OLED 화면용 완전 블랙 모드</span>
                      </div>
                      <input className="toggle-switch-input" id="amoled-toggle" type="checkbox" checked={isAmoled} onChange={(event) => setIsAmoled(event.target.checked)} />
                      <label htmlFor="amoled-toggle" className="toggle-switch-label" />
                    </div>
                    <hr className="sheet-divider" />
                    <div className="settings-row-item">
                      <div className="settings-row-left">
                        <span className="settings-row-label">햅틱 진동</span>
                        <span className="settings-row-desc">지원 기기에서 터치 반응 사용</span>
                      </div>
                      <input className="toggle-switch-input" id="haptic-toggle" type="checkbox" checked={isHapticEnabled} onChange={(event) => setIsHapticEnabled(event.target.checked)} />
                      <label htmlFor="haptic-toggle" className="toggle-switch-label" />
                    </div>
                  </div>

                  <div className="premium-glass-card settings-section-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                    <span className="settings-section-title" style={{ color: 'var(--danger)' }}>초기화</span>
                    <div className="settings-row-item">
                      <div className="settings-row-left">
                        <span className="settings-row-label">모든 학습 데이터 삭제</span>
                        <span className="settings-row-desc">오답노트와 통계를 초기화</span>
                      </div>
                      <button className="settings-btn-action settings-btn-danger" type="button" onClick={handleResetData}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isExamActive && (
            <nav className="floating-bottom-nav">
              <button className={`nav-tab-btn ${activeTab === 'home' ? 'nav-tab-active' : ''}`} type="button" onClick={() => setActiveTab('home')}>
                {activeTab === 'home' && <span className="nav-active-bubble" />}
                <HomeIcon size={19} />
                <span>홈</span>
                {activeTab === 'home' && <span className="nav-active-dot" />}
              </button>
              <button className={`nav-tab-btn ${activeTab === 'training' ? 'nav-tab-active' : ''}`} type="button" onClick={() => setActiveTab('training')}>
                {activeTab === 'training' && <span className="nav-active-bubble" />}
                <Zap size={19} />
                <span>훈련</span>
                {activeTab === 'training' && <span className="nav-active-dot" />}
              </button>
              <button className={`nav-tab-btn ${activeTab === 'notes' ? 'nav-tab-active' : ''}`} type="button" onClick={() => setActiveTab('notes')}>
                {activeTab === 'notes' && <span className="nav-active-bubble" />}
                <FileText size={19} />
                <span>오답</span>
                {activeTab === 'notes' && <span className="nav-active-dot" />}
              </button>
              <button className={`nav-tab-btn ${activeTab === 'settings' ? 'nav-tab-active' : ''}`} type="button" onClick={() => setActiveTab('settings')}>
                {activeTab === 'settings' && <span className="nav-active-bubble" />}
                <Sliders size={19} />
                <span>설정</span>
                {activeTab === 'settings' && <span className="nav-active-dot" />}
              </button>
            </nav>
          )}
        </div>

        {isCourseBuilderOpen && (
          <div className="bottom-sheet-overlay">
            <div className="bottom-sheet-content course-builder-sheet">
              <div className="bottom-sheet-header">
                <div>
                  <span className="sheet-selector-label">Daily Course Builder</span>
                  <h4>오늘 연습할 유형 선택</h4>
                </div>
                <button className="close-circle-btn" type="button" onClick={() => setIsCourseBuilderOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="course-selected-summary">
                <span>{selectedTypes.length}개 유형 선택됨</span>
                <strong>
                  {selectedTypes.length === 0
                    ? '유형을 하나 이상 골라주세요'
                    : isDifficultyFixed ? `${estimateCourseCount(selectedTypes)}문제 코스` : '난이도 선택 후 확정'}
                </strong>
              </div>

              <div className="course-difficulty-summary">
                <span>난이도</span>
                <strong>{isDifficultyFixed ? `${difficultyLabel(selectedDifficulty)} 고정` : '시작할 때 선택'}</strong>
              </div>

              {(['data', 'situation', 'logic'] as const).map((subjectKey) => (
                <section className="course-builder-section" key={subjectKey}>
                  <h5>{subjectLabels[subjectKey]}</h5>
                  <div className="course-type-grid">
                    {trainingTypes.filter((type) => type.subjectKey === subjectKey).map((type) => {
                      const checked = selectedTypeIds.includes(type.id);
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          className={`course-type-check ${subjectToneClass(type.subjectKey)} ${checked ? 'course-type-check-active' : ''}`}
                          onClick={() => toggleTrainingType(type.id)}
                        >
                          <span className="course-checkmark">{checked ? '✓' : ''}</span>
                          <Icon size={14} />
                          <span>{type.shortName}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <button className="action-confirm-btn" type="button" disabled={selectedTypes.length === 0} onClick={startDailyCourse}>
                <Play size={16} />
                훈련 코스 시작
              </button>
            </div>
          </div>
        )}

        {isQuickTypeSettingsOpen && (
          <div className="bottom-sheet-overlay">
            <div className="bottom-sheet-content quick-type-settings-sheet">
              <div className="bottom-sheet-header">
                <div>
                  <span className="sheet-selector-label">Quick Training</span>
                  <h4>즐겨찾는 훈련 선택</h4>
                </div>
                <button className="close-circle-btn" type="button" onClick={() => setIsQuickTypeSettingsOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="course-selected-summary">
                <span>{draftQuickTypeIds.length}개 선택됨</span>
                <strong>{draftQuickTypeIds.length === 0 ? '최소 1개 선택' : '메인에 바로 노출'}</strong>
              </div>

              {(['data', 'situation', 'logic'] as const).map((subjectKey) => (
                <section className="course-builder-section" key={subjectKey}>
                  <h5>{subjectLabels[subjectKey]}</h5>
                  <div className="course-type-grid">
                    {trainingTypes.filter((type) => type.subjectKey === subjectKey).map((type) => {
                      const checked = draftQuickTypeIds.includes(type.id);
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          className={`course-type-check ${subjectToneClass(type.subjectKey)} ${checked ? 'course-type-check-active' : ''}`}
                          onClick={() => toggleQuickTrainingType(type.id)}
                        >
                          <span className="course-checkmark">{checked ? '✓' : ''}</span>
                          <Icon size={14} />
                          <span>{type.shortName}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <button className="action-confirm-btn" type="button" disabled={draftQuickTypeIds.length === 0} onClick={confirmQuickTypeSettings}>
                <CheckCircle2 size={16} />
                확인
              </button>
            </div>
          </div>
        )}

        {isDifficultySheetOpen && (
          <div className="bottom-sheet-overlay">
            <div className="bottom-sheet-content difficulty-sheet">
              <div className="bottom-sheet-header">
                <div>
                  <span className="sheet-selector-label">Training Difficulty</span>
                  <h4>{difficultySheetMode === 'launch' ? '난이도는 어떻게 할까요?' : '훈련 난이도 설정'}</h4>
                </div>
                <button className="close-circle-btn" type="button" onClick={() => setIsDifficultySheetOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="difficulty-option-list">
                {(['beginner', 'intermediate', 'advanced'] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    className={`difficulty-option-card difficulty-${difficulty} ${selectedDifficulty === difficulty ? 'difficulty-option-active' : ''}`}
                    onClick={() => handleDifficultyChoice(difficulty)}
                  >
                    <div>
                      <strong>{difficultyProfiles[difficulty].label}</strong>
                      <span>{difficultyProfiles[difficulty].desc}</span>
                    </div>
                    {selectedDifficulty === difficulty && <CheckCircle2 size={17} />}
                  </button>
                ))}
              </div>

              <button
                className={`difficulty-fixed-toggle ${isDifficultyFixed ? 'difficulty-fixed-toggle-active' : ''}`}
                type="button"
                onClick={() => setIsDifficultyFixed((prev) => !prev)}
              >
                <CheckCircle2 size={16} />
                <div>
                  <strong>고정</strong>
                  <span>{isDifficultyFixed ? `모든 훈련을 ${difficultyLabel(selectedDifficulty)}으로 시작` : '고정하지 않으면 시작할 때마다 선택'}</span>
                </div>
              </button>

              {difficultySheetMode === 'settings' && (
                <button className="action-confirm-btn" type="button" onClick={() => setIsDifficultySheetOpen(false)}>
                  저장하고 닫기
                </button>
              )}
            </div>
          </div>
        )}

        {isMethodFinderOpen && (
          <div className="method-finder-viewport">
            <div className="smartphone-status-bar quiz-status-bar">
              <span className="status-time">{systemTime}</span>
              <div className="status-bar-right">
                <Signal size={12} className="status-icon-item" />
                <Wifi size={12} className="status-icon-item" />
                <Battery size={14} className="status-icon-item" />
              </div>
            </div>

            <div className="method-finder-header">
              <button className="quiz-home-btn" type="button" onClick={closeMethodFinder} aria-label="홈으로 돌아가기">
                <HomeIcon size={15} />
              </button>
              <div className="method-header-title">
                <span>Method Lab</span>
                <h6>나에게 맞는 풀이 찾기</h6>
              </div>
              <div className="method-header-step">
                {methodFinderStep === 'select-type' && '유형 선택'}
                {methodFinderStep === 'trial' && `${methodFinderIndex + 1}/${methodFinderPlan.length}`}
                {methodFinderStep === 'result' && '결과'}
              </div>
            </div>

            {methodFinderStep === 'select-type' && (
              <div className="method-finder-body animate-slide">
                <div className="method-lab-hero">
                  <span>풀이법 A/B 테스트</span>
                  <h4>같은 유형을 여러 풀이로 풀어보고 주력 풀이를 찾습니다.</h4>
                  <p>정답률, 평균 시간, 시간 편차, 체감 난이도를 합쳐 적합도를 계산합니다.</p>
                </div>

                <div className="horizontal-chips-bar method-filter-bar">
                  {(['all', 'data', 'situation', 'logic'] as const).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`filter-pill-chip ${methodSubjectFilter === chip ? 'filter-pill-chip-active' : ''}`}
                      onClick={() => setMethodSubjectFilter(chip)}
                    >
                      {chip === 'all' ? '전체' : subjectLabels[chip]}
                    </button>
                  ))}
                </div>

                <div className="method-type-grid">
                  {filteredMethodFinderTypes.map((type) => {
                    const Icon = type.icon;
                    const methodCount = methodsForType(type.id).length;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        className={`method-type-card ${methodFinderTypeId === type.id ? 'method-type-card-active' : ''}`}
                        onClick={() => setMethodFinderTypeId(type.id)}
                      >
                        <Icon size={16} />
                        <span>{type.name}</span>
                        <small>{methodCount}개 풀이</small>
                      </button>
                    );
                  })}
                </div>

                {methodFinderType && (
                  <div className="method-selected-panel">
                    <div className="method-selected-head">
                      <div>
                        <span>{methodFinderType.subject}</span>
                        <h5>{methodFinderType.name}</h5>
                      </div>
                      <strong>{methodFinderMethods.slice(0, 3).length * 2}문제</strong>
                    </div>
                    <div className="method-preview-list">
                      {methodFinderMethods.slice(0, 3).map((method) => (
                        <span key={method.id}>{method.name}</span>
                      ))}
                    </div>
                    <button className="action-confirm-btn" type="button" onClick={() => startMethodDiagnostic(methodFinderType.id)}>
                      <Play size={16} />
                      풀이 적합도 테스트 시작
                    </button>
                  </div>
                )}
              </div>
            )}

            {methodFinderStep === 'trial' && currentMethodTrial && (
              <>
                <div className="method-finder-body method-trial-body">
                  <div className="quiz-q-meta">
                    <span className="q-index-val">Q{methodFinderIndex + 1} / {methodFinderPlan.length}</span>
                    <span className="q-type-meta">경과 {methodElapsedSeconds}초</span>
                  </div>
                  <div className="quiz-progress-track" aria-label="풀이법 테스트 진행률">
                    <span style={{ width: `${((methodFinderIndex + 1) / methodFinderPlan.length) * 100}%` }} />
                  </div>

                  <div className="method-coach-card">
                    <div className="method-coach-title">
                      <span>이번 문제는 이 방식으로</span>
                      <h5>{currentMethodTrial.method.name}</h5>
                    </div>
                    <p className="method-best-for">{currentMethodTrial.method.bestFor}</p>
                    <div className="method-cue-box">{currentMethodTrial.method.cue}</div>
                    <ol className="method-step-list">
                      {currentMethodTrial.method.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <p className="method-warning-text">{currentMethodTrial.method.warning}</p>
                  </div>

                  <div className="quiz-type-line">{currentMethodTrial.question.subject} · {currentMethodTrial.question.typeName}</div>
                  <h5 className="quiz-q-title">{currentMethodTrial.question.title}</h5>
                  <p className="quiz-q-title method-question-prompt">{currentMethodTrial.question.prompt}</p>

                  {currentMethodTrial.question.passage && (
                    <div className="quiz-passage-box">{currentMethodTrial.question.passage}</div>
                  )}

                  {currentMethodTrial.question.table && (
                    <div className="quiz-table-wrapper">
                      <table className="quiz-data-table">
                        <thead>
                          <tr>
                            {currentMethodTrial.question.table.headers.map((header) => <th key={header}>{header}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {currentMethodTrial.question.table.rows.map((row) => (
                            <tr key={row.join('-')}>
                              {row.map((cell, index) => <td key={`${cell}-${index}`} className={index === 0 ? 'cell-highlight' : ''}>{cell}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="quiz-options-list">
                    {currentMethodTrial.question.options.map((option, index) => (
                      <button
                        key={`${option}-${index}`}
                        type="button"
                        className={[
                          'quiz-opt-item',
                          currentMethodAnswer === index ? 'quiz-opt-selected' : '',
                          isCurrentMethodAnswered && index === currentMethodTrial.question.correctIndex ? 'quiz-opt-correct' : '',
                          isCurrentMethodAnswered && currentMethodAnswer === index && index !== currentMethodTrial.question.correctIndex ? 'quiz-opt-wrong' : '',
                        ].join(' ')}
                        onClick={() => handleSelectMethodOption(methodFinderIndex, index)}
                      >
                        <span className="opt-index-ring">{index + 1}</span>
                        <span className="opt-text-val">{option}</span>
                      </button>
                    ))}
                  </div>

                  {isCurrentMethodAnswered && (
                    <div className={currentMethodAnswer === currentMethodTrial.question.correctIndex ? 'instant-answer-card correct' : 'instant-answer-card wrong'}>
                      <div>
                        <strong>{currentMethodAnswer === currentMethodTrial.question.correctIndex ? '정답' : `오답 · 정답은 ${currentMethodTrial.question.correctIndex + 1}번`}</strong>
                        <p>{currentMethodTrial.question.explanation}</p>
                      </div>
                    </div>
                  )}

                  {isCurrentMethodAnswered && (
                    <div className="method-comfort-card">
                      <span>이 풀이, 몸에 맞았나요?</span>
                      <div className="method-comfort-row">
                        {(['easy', 'neutral', 'hard'] as const).map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            className={`method-comfort-btn ${currentMethodComfort === rating ? 'method-comfort-btn-active' : ''}`}
                            onClick={() => handleMethodComfort(methodFinderIndex, rating)}
                          >
                            {comfortLabel(rating)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="quiz-viewport-footer method-footer">
                  <button className="quiz-nav-btn" type="button" onClick={closeMethodFinder}>
                    그만하기
                  </button>
                  <button
                    className="quiz-submit-btn"
                    type="button"
                    disabled={!isCurrentMethodAnswered || !currentMethodComfort}
                    onClick={goToNextMethodTrial}
                  >
                    {methodFinderIndex === methodFinderPlan.length - 1 ? '결과 보기' : '다음 풀이'}
                  </button>
                </div>
              </>
            )}

            {methodFinderStep === 'result' && primaryMethodResult && (
              <div className="method-finder-body method-result-body animate-slide">
                <div className="method-result-hero">
                  <span>주력 풀이 후보</span>
                  <h4>{primaryMethodResult.method.name}</h4>
                  <p>
                    적합도 {primaryMethodResult.score}점 · 정답률 {primaryMethodResult.accuracy}% · 평균 {primaryMethodResult.avgSeconds}초
                  </p>
                </div>

                <div className="method-result-grid">
                  <div>
                    <span>주력</span>
                    <strong>{primaryMethodResult.method.name}</strong>
                  </div>
                  <div>
                    <span>보험</span>
                    <strong>{backupMethodResult?.method.name ?? '추가 테스트 필요'}</strong>
                  </div>
                </div>

                <div className="method-result-list">
                  {methodFitResults.map((result, index) => (
                    <div className="method-result-card" key={result.method.id}>
                      <div className="method-result-rank">{index + 1}</div>
                      <div className="method-result-main">
                        <div className="method-result-title-row">
                          <h5>{result.method.name}</h5>
                          <span>{result.score}점</span>
                        </div>
                        <p>{result.verdict}</p>
                        <div className="method-metric-row">
                          <span>정답률 {result.accuracy}%</span>
                          <span>평균 {result.avgSeconds}초</span>
                          <span>안정성 {result.consistency}%</span>
                          <span>체감 {result.comfortScore}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="method-result-actions">
                  <button className="quiz-nav-btn" type="button" onClick={() => setMethodFinderStep('select-type')}>
                    다른 유형
                  </button>
                  <button className="quiz-nav-btn quiz-next-active" type="button" onClick={() => startMethodDiagnostic(methodFinderTypeId)}>
                    다시 테스트
                  </button>
                  <button className="quiz-submit-btn" type="button" onClick={closeMethodFinder}>
                    홈으로
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isExamActive && currentQuestion && (
          <div className="immersive-quiz-viewport">
            <div className="smartphone-status-bar quiz-status-bar">
              <span className="status-time">{systemTime}</span>
              <div className="status-bar-right">
                <Signal size={12} className="status-icon-item" />
                <Wifi size={12} className="status-icon-item" />
                <Battery size={14} className="status-icon-item" />
              </div>
            </div>

            <div className="quiz-viewport-header">
              <div className="quiz-header-left">
                <button className="quiz-home-btn" type="button" onClick={exitTrainingToHome} aria-label="홈으로 돌아가기">
                  <HomeIcon size={15} />
                </button>
                <div className="quiz-scope-badge">
                  <span className="quiz-tag">{activeExamDifficulty ? difficultyLabel(activeExamDifficulty) : 'REVIEW'}</span>
                  <h6>{activeCourseTypes.join(' · ')}</h6>
                </div>
              </div>
              <div className="quiz-countdown-box">
                <Timer size={13} />
                {formatTime(secondsLeft)}
              </div>
            </div>

            <div className="quiz-scrollable-body">
              <div className="quiz-q-meta">
                <span className="q-index-val">Q{currentQIndex + 1} / {activeExamQuestions.length}</span>
                <span className="q-type-meta">남은 문제 {remainingQuestions}개</span>
              </div>
              <div className="quiz-progress-track" aria-label="훈련 진행률">
                <span style={{ width: `${((currentQIndex + 1) / activeExamQuestions.length) * 100}%` }} />
              </div>
              <div className="quiz-type-line">{currentQuestion.subject} · {currentQuestion.typeName}</div>

              <div className="type-rival-card">
                <span>내 기록과 싸우기</span>
                <strong>
                  최근 {currentTypeStat?.lastSeconds ?? '-'}초 · 최고 {currentTypeStat?.bestSeconds ?? '-'}초 · 평균 {currentTypeStat ? averageSeconds(currentTypeStat) : '-'}초
                </strong>
              </div>

              <h5 className="quiz-q-title">{currentQuestion.title}</h5>
              <p className="quiz-q-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{currentQuestion.prompt}</p>

              {currentQuestion.passage && (
                <div className="quiz-passage-box">{currentQuestion.passage}</div>
              )}

              {currentQuestion.table && (
                <div className="quiz-table-wrapper">
                  <table className="quiz-data-table">
                    <thead>
                      <tr>
                        {currentQuestion.table.headers.map((header) => <th key={header}>{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {currentQuestion.table.rows.map((row) => (
                        <tr key={row.join('-')}>
                          {row.map((cell, index) => <td key={`${cell}-${index}`} className={index === 0 ? 'cell-highlight' : ''}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="quiz-options-list">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={`${option}-${index}`}
                    type="button"
                    className={[
                      'quiz-opt-item',
                      currentAnswer === index ? 'quiz-opt-selected' : '',
                      isCurrentAnswered && index === currentQuestion.correctIndex ? 'quiz-opt-correct' : '',
                      isCurrentAnswered && currentAnswer === index && index !== currentQuestion.correctIndex ? 'quiz-opt-wrong' : '',
                    ].join(' ')}
                    onClick={() => handleSelectOption(currentQIndex, index)}
                  >
                    <span className="opt-index-ring">{index + 1}</span>
                    <span className="opt-text-val">{option}</span>
                  </button>
                ))}
              </div>

              {isCurrentAnswered && (
                <div className={currentAnswer === currentQuestion.correctIndex ? 'instant-answer-card correct' : 'instant-answer-card wrong'}>
                  <div>
                    <strong>{currentAnswer === currentQuestion.correctIndex ? '정답' : `오답 · 정답은 ${currentQuestion.correctIndex + 1}번`}</strong>
                    <p>{currentQuestion.explanation}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="quiz-viewport-footer">
              <button className="quiz-nav-btn" type="button" onClick={goToPreviousQuestionOrPage}>
                이전
              </button>
              {currentQIndex === activeExamQuestions.length - 1 ? (
                <button className="quiz-submit-btn" type="button" onClick={handleExamSubmit}>
                  일일훈련 완료
                </button>
              ) : (
                <button className="quiz-nav-btn quiz-next-active" type="button" onClick={() => goToQuestion(currentQIndex + 1)}>
                  다음
                </button>
              )}
            </div>
          </div>
        )}

        {showResultsOverlay && lastExamResult && (
          <div className="bottom-sheet-overlay">
            <div className="bottom-sheet-content celebration-view-body">
              <div className="trophy-ring-box">
                <Trophy size={30} />
              </div>
              <h4>일일훈련 완료</h4>
              <p className="result-subcopy">
                {lastExamResult.correct}/{lastExamResult.total} 정답 · 정답률 {lastExamResult.accuracy}%
              </p>
              <div className="summary-details-box" style={{ width: '100%', marginTop: '14px' }}>
                <div className="details-row">
                  <span>훈련 유형</span>
                  <strong>{lastExamResult.selectedTypes.join(', ')}</strong>
                </div>
                <div className="details-row">
                  <span>오답노트</span>
                  <strong>{incorrectNotes.length}개 저장</strong>
                </div>
              </div>
              <button className="action-confirm-btn" type="button" onClick={() => setShowResultsOverlay(false)}>
                홈으로 돌아가기
              </button>
            </div>
          </div>
        )}

        <div className="smartphone-gesture-indicator">
          <div className="gesture-indicator-bar" />
        </div>
      </div>
    </div>
  );
}
