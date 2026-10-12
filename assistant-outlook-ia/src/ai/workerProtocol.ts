/**
 * Protocole typé des échanges entre l'interface et les workers d'inférence.
 * Aucun contenu n'est journalisé : seuls des textes à traiter et leurs résultats transitent,
 * entre deux contextes du même navigateur.
 */

import type { WorkerEnvOptions } from './workerEnv';

export type DType = string | Record<string, string>;

export interface LoadRequest {
  type: 'load';
  repo: string;
  revision: string;
  dtype: DType;
  device: 'webgpu' | 'wasm';
  env: WorkerEnvOptions;
}

export interface TranscribeRequest {
  type: 'transcribe';
  id: number;
  audio: Float32Array;
  final: boolean;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  type: 'generate';
  id: number;
  messages: ChatTurn[];
  maxNewTokens: number;
}

/** Interrompt la génération en cours sans décharger le modèle. */
export interface InterruptRequest {
  type: 'interrupt';
}

export interface DisposeRequest {
  type: 'dispose';
}

export type WorkerRequest = LoadRequest | TranscribeRequest | GenerateRequest | InterruptRequest | DisposeRequest;

export interface ProgressMessage {
  type: 'progress';
  status: 'download' | 'initiate' | 'done' | 'ready';
  loaded: number;
  total: number;
  file?: string;
}

export interface ReadyMessage {
  type: 'ready';
  device: 'webgpu' | 'wasm';
  warmupMs?: number;
}

export interface ResultMessage {
  type: 'result';
  id: number;
  final: boolean;
  text: string;
  ms: number;
}

export interface TokenMessage {
  type: 'token';
  id: number;
  text: string;
}

export interface DoneMessage {
  type: 'done';
  id: number;
  text: string;
  ms: number;
  /** Vrai si la génération a été arrêtée par l'utilisateur. */
  interrupted: boolean;
}

export interface ErrorMessage {
  type: 'error';
  /** Absent pour une erreur de chargement. */
  id?: number;
  message: string;
}

export interface DisposedMessage {
  type: 'disposed';
}

export type WorkerResponse = ProgressMessage | ReadyMessage | ResultMessage | TokenMessage | DoneMessage | ErrorMessage | DisposedMessage;

/** Contexte global d'un worker dédié, typé pour nos messages. */
export interface TypedWorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
}
