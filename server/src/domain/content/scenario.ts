import type { ScenarioKind } from '../../../../shared/contracts';

export type { ScenarioKind };

export interface StepOption {
  readonly id: number;
  readonly order: number;
  readonly expressionId: string;
  readonly correct: boolean;
  readonly feedback: string;
  /** null = a resposta encerra o evento. */
  readonly nextStepKey: string | null;
}

export interface ScenarioStep {
  readonly id: number;
  readonly key: string;
  readonly order: number;
  readonly npcExpressionId: string;
  readonly prompt: string;
  readonly options: readonly StepOption[];
}

export interface ScenarioProps {
  readonly id: string;
  readonly kind: ScenarioKind;
  readonly locationId: string | null;
  readonly npcId: string;
  readonly title: string;
  readonly inviteTextPt: string | null;
  readonly inviteTextJp: string | null;
  readonly cultureNote: string;
  readonly farewellExpressionId: string;
  readonly minLevel: number;
  readonly steps: readonly ScenarioStep[];
}

/** Agregado: uma conversa com um NPC, em passos com opções de resposta. */
export class Scenario {
  constructor(private readonly props: ScenarioProps) {}

  get id(): string { return this.props.id; }
  get kind(): ScenarioKind { return this.props.kind; }
  get npcId(): string { return this.props.npcId; }
  get title(): string { return this.props.title; }
  get inviteTextPt(): string | null { return this.props.inviteTextPt; }
  get inviteTextJp(): string | null { return this.props.inviteTextJp; }
  get cultureNote(): string { return this.props.cultureNote; }
  get farewellExpressionId(): string { return this.props.farewellExpressionId; }
  get steps(): readonly ScenarioStep[] { return this.props.steps; }

  step(stepId: number): ScenarioStep | undefined {
    return this.props.steps.find((s) => s.id === stepId);
  }

  option(step: ScenarioStep, optionId: number): StepOption | undefined {
    return step.options.find((o) => o.id === optionId);
  }

  optionById(optionId: number): StepOption | undefined {
    for (const step of this.props.steps) {
      const option = this.option(step, optionId);
      if (option) return option;
    }
    return undefined;
  }

  /** Todas as expressões citadas (falas do NPC, opções e despedida). */
  expressionIds(): string[] {
    const ids = new Set<string>([this.props.farewellExpressionId]);
    for (const step of this.props.steps) {
      ids.add(step.npcExpressionId);
      for (const o of step.options) ids.add(o.expressionId);
    }
    return [...ids];
  }
}
