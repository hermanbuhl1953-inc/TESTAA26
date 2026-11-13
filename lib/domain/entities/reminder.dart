class Reminder {
  final String id;
  final String deadlineId;
  final int daysBefore;
  final bool active;
  final DateTime scheduledAt;

  const Reminder({
    required this.id,
    required this.deadlineId,
    required this.daysBefore,
    required this.active,
    required this.scheduledAt,
  });
}
