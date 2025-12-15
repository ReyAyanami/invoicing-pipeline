import { Money, Quantity } from './money.type';

describe('Money', () => {
  describe('from', () => {
    it('should create Money from string', () => {
      const result = Money.from('10.50');
      expect(result).toBe('10.50');
    });

    it('should create Money from number', () => {
      const result = Money.from(10.5);
      expect(result).toBe('10.50');
    });

    it('should fix precision to 2 decimals', () => {
      const result = Money.from('10.5');
      expect(result).toBe('10.50');
    });
  });

  describe('add', () => {
    it('should add two money values precisely', () => {
      const result = Money.add('0.1' as any, '0.2' as any);
      expect(result).toBe('0.30'); // Not 0.30000000000000004!
    });

    it('should add multiple money values', () => {
      const result = Money.add('10.00' as any, '20.50' as any, '5.25' as any);
      expect(result).toBe('35.75');
    });
  });

  describe('subtract', () => {
    it('should subtract money values', () => {
      const result = Money.subtract('100.00' as any, '25.50' as any);
      expect(result).toBe('74.50');
    });
  });

  describe('multiply', () => {
    it('should multiply money by quantity', () => {
      const result = Money.multiply('10.50' as any, 3);
      expect(result).toBe('31.50');
    });

    it('should handle decimal multipliers', () => {
      const result = Money.multiply('100.00' as any, 0.1);
      expect(result).toBe('10.00');
    });
  });

  describe('divide', () => {
    it('should divide money', () => {
      const result = Money.divide('100.00' as any, 4);
      expect(result).toBe('25.00');
    });

    it('should round to 2 decimals', () => {
      const result = Money.divide('10.00' as any, 3);
      expect(result).toBe('3.33');
    });
  });

  describe('sum', () => {
    it('should sum array of money values', () => {
      const values = ['10.00', '20.50', '15.25', '5.00'] as any[];
      const result = Money.sum(values);
      expect(result).toBe('50.75');
    });

    it('should handle empty array', () => {
      const result = Money.sum([]);
      expect(result).toBe('0.00');
    });
  });

  describe('compare', () => {
    it('should return 1 when first is greater', () => {
      expect(Money.compare('10.00' as any, '5.00' as any)).toBe(1);
    });

    it('should return -1 when first is less', () => {
      expect(Money.compare('5.00' as any, '10.00' as any)).toBe(-1);
    });

    it('should return 0 when equal', () => {
      expect(Money.compare('10.00' as any, '10.00' as any)).toBe(0);
    });
  });

  describe('greaterThan', () => {
    it('should return true when first is greater', () => {
      expect(Money.greaterThan('10.00' as any, '5.00' as any)).toBe(true);
    });

    it('should return false when first is not greater', () => {
      expect(Money.greaterThan('5.00' as any, '10.00' as any)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal values', () => {
      expect(Money.equals('10.00' as any, '10.00' as any)).toBe(true);
    });

    it('should return false for different values', () => {
      expect(Money.equals('10.00' as any, '10.01' as any)).toBe(false);
    });
  });

  describe('zero', () => {
    it('should return zero money value', () => {
      expect(Money.zero()).toBe('0.00');
    });
  });
});

describe('Quantity', () => {
  describe('from', () => {
    it('should create Quantity with default 6 decimals', () => {
      const result = Quantity.from(100);
      expect(result).toBe('100.000000');
    });

    it('should create Quantity with custom precision', () => {
      const result = Quantity.from(100, 3);
      expect(result).toBe('100.000');
    });
  });

  describe('add', () => {
    it('should add quantities', () => {
      const result = Quantity.add('100.5' as any, '200.3' as any);
      expect(result).toBe('300.800000');
    });
  });

  describe('multiply', () => {
    it('should multiply quantity', () => {
      const result = Quantity.multiply('10.5' as any, 2);
      expect(result).toBe('21.000000');
    });
  });
});
