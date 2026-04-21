export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class WorkerNotFound extends DomainError {
  constructor(id: string) {
    super('worker_not_found', `Worker ${id} introuvable dans le tenant courant`);
  }
}

export class DuplicateAvs extends DomainError {
  constructor(avs: string) {
    super('duplicate_avs', `Un intérimaire avec l'AVS ${avs} existe déjà dans cette agence`);
  }
}

export class WorkerArchived extends DomainError {
  constructor(id: string) {
    super('worker_archived', `Worker ${id} est archivé, mutation refusée`);
  }
}
