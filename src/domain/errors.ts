/** Business-rule violation with a user-safe message. */
export class DomainError extends Error {
  constructor(message: string, public code: string = "DOMAIN_ERROR") {
    super(message);
    this.name = "DomainError";
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super(`Cannot change ${entity} from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`, "INVALID_TRANSITION");
  }
}
