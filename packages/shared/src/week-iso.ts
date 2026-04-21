export class WeekIso {
  private constructor(
    public readonly year: number,
    public readonly week: number,
  ) {}

  static of(year: number, week: number): WeekIso {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new Error(`WeekIso: invalid ISO year ${String(year)}`);
    }
    if (!Number.isInteger(week) || week < 1 || week > 53) {
      throw new Error(`WeekIso: invalid ISO week ${String(week)}`);
    }
    return new WeekIso(year, week);
  }

  static fromDate(date: Date): WeekIso {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const firstThursday = Date.UTC(target.getUTCFullYear(), 0, 4);
    const weekNumber = 1 + Math.round((target.getTime() - firstThursday) / (7 * 24 * 3600 * 1000));
    return new WeekIso(target.getUTCFullYear(), weekNumber);
  }

  static firstDayOf(value: string): Date {
    const match = /^(\d{4})-W(\d{2})$/.exec(value);
    if (!match) {
      throw new Error(`WeekIso.firstDayOf: invalid format "${value}", expected YYYY-Www`);
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
    const weekOneMonday = new Date(jan4.getTime());
    weekOneMonday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const result = new Date(weekOneMonday.getTime());
    result.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);
    return result;
  }

  toString(): string {
    return `${String(this.year)}-W${String(this.week).padStart(2, '0')}`;
  }

  equals(other: WeekIso): boolean {
    return this.year === other.year && this.week === other.week;
  }
}
