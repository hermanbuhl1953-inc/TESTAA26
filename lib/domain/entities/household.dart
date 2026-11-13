class Household {
  final String id;
  final String name;
  final List<String> memberIds;
  final DateTime createdAt;

  const Household({
    required this.id,
    required this.name,
    required this.memberIds,
    required this.createdAt,
  });
}
