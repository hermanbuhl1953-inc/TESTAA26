import 'package:flutter_test/flutter_test.dart';

import 'package:scadenzario_mvp/data/models/deadline_model.dart';
import 'package:scadenzario_mvp/domain/entities/deadline.dart';
import 'package:scadenzario_mvp/domain/entities/user.dart';

void main() {
  test('deadline persists and restores all supported fields', () {
    final deadline = Deadline(
      id: 'test-1',
      title: 'Pagamento bolletta',
      category: 'casa',
      description: 'Luce',
      dueDate: DateTime(2026, 12, 10),
      recurrenceMonths: 2,
      amountCents: 12345,
      reminderDays: const [7, 1],
      isCompleted: false,
      isArchived: false,
      source: 'manual',
      catalogItemId: 'c02',
      profileType: ProfileType.famiglia,
      userId: 'local-user',
      createdAt: DateTime(2026, 11, 1, 12),
      updatedAt: DateTime(2026, 11, 2, 12),
    );

    final restored = DeadlineModel.fromMap(
      DeadlineModel.fromEntity(deadline).toMap(),
    ).toEntity();

    expect(restored.id, deadline.id);
    expect(restored.title, deadline.title);
    expect(restored.dueDate, deadline.dueDate);
    expect(restored.amountCents, 12345);
    expect(restored.reminderDays, [7, 1]);
    expect(restored.profileType, ProfileType.famiglia);
    expect(restored.createdAt, deadline.createdAt);
    expect(restored.updatedAt, deadline.updatedAt);
  });
}
