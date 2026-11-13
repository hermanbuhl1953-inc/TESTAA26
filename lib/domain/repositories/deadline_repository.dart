import '../entities/deadline.dart';

abstract class DeadlineRepository {
  Future<List<Deadline>> getAll();
  Future<Deadline?> getById(String id);
  Future<void> save(Deadline deadline);
  Future<void> delete(String id);
  Future<List<Deadline>> getByProfile(String profile);
}
