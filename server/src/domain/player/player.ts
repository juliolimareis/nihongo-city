import { levelForXp } from './leveling';

export interface PlayerProps {
  id: number;
  name: string;
  level: number;
  xp: number;
  createdAt: string;
}

/** Entidade raiz do contexto do jogador: identidade, XP e nível. */
export class Player {
  private constructor(private props: PlayerProps) {}

  static restore(props: PlayerProps): Player {
    return new Player({ ...props });
  }

  get id(): number { return this.props.id; }
  get name(): string { return this.props.name; }
  get level(): number { return this.props.level; }
  get xp(): number { return this.props.xp; }
  get createdAt(): string { return this.props.createdAt; }

  gainXp(amount: number): void {
    const xp = this.props.xp + amount;
    this.props = { ...this.props, xp, level: levelForXp(xp) };
  }

  resetProgress(): void {
    this.props = { ...this.props, xp: 0, level: 1 };
  }

  snapshot(): Readonly<PlayerProps> {
    return { ...this.props };
  }
}
