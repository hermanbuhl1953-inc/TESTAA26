import 'package:flutter_test/flutter_test.dart';

import 'package:scadenzario_mvp/core/utils/date_utils.dart';

void main() {
  group('DateUtilsHelper.addMonthsClamped', () {
    test('clamps the day to the last day of a shorter month', () {
      expect(
        DateUtilsHelper.addMonthsClamped(DateTime(2025, 1, 31), 1),
        DateTime(2025, 2, 28),
      );
    });

    test('respects leap years', () {
      expect(
        DateUtilsHelper.addMonthsClamped(DateTime(2024, 1, 31), 1),
        DateTime(2024, 2, 29),
      );
    });

    test('keeps the original day when possible', () {
      expect(
        DateUtilsHelper.addMonthsClamped(DateTime(2025, 1, 15), 2),
        DateTime(2025, 3, 15),
      );
    });
  });
}
