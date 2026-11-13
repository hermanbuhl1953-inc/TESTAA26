import 'package:flutter/material.dart';

import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../domain/entities/deadline.dart';
import '../../domain/entities/user.dart';

class DeadlineFormScreen extends StatefulWidget {
  const DeadlineFormScreen({
    required this.user,
    this.initialDeadline,
    super.key,
  });

  final User user;
  final Deadline? initialDeadline;

  @override
  State<DeadlineFormScreen> createState() => _DeadlineFormScreenState();
}

class _DeadlineFormScreenState extends State<DeadlineFormScreen> {
  static const _categories = <String, String>{
    'auto': 'Auto e trasporti',
    'casa': 'Casa',
    'fisco': 'Fisco',
    'documenti': 'Documenti',
    'salute': 'Salute',
    'famiglia': 'Famiglia',
    'banca': 'Banca e rate',
    'assicurazioni': 'Assicurazioni',
    'abbonamenti': 'Abbonamenti',
    'lavoro': 'Lavoro',
    'altro': 'Altro',
  };
  static const _recurrenceOptions = <int, String>{
    0: 'Una tantum',
    1: 'Ogni mese',
    2: 'Ogni 2 mesi',
    3: 'Ogni 3 mesi',
    6: 'Ogni 6 mesi',
    12: 'Ogni anno',
  };

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _amountController;
  late String _category;
  late DateTime _dueDate;
  late int _recurrenceMonths;

  @override
  void initState() {
    super.initState();
    final deadline = widget.initialDeadline;
    _titleController = TextEditingController(text: deadline?.title ?? '');
    _descriptionController =
        TextEditingController(text: deadline?.description ?? '');
    _amountController = TextEditingController(
      text: deadline == null || deadline.amountCents == 0
          ? ''
          : (deadline.amountCents / 100).toStringAsFixed(2).replaceAll('.', ','),
    );
    _category = deadline != null && _categories.containsKey(deadline.category)
        ? deadline.category
        : 'altro';
    _dueDate = deadline?.dueDate ?? DateTime.now().add(const Duration(days: 7));
    _recurrenceMonths = deadline?.recurrenceMonths ?? 0;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _selectDate() async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: _dueDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      helpText: 'Seleziona la scadenza',
    );
    if (selectedDate != null) {
      setState(() => _dueDate = DateUtilsHelper.dateOnly(selectedDate));
    }
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    final amountCents = parseEuroAmountToCents(_amountController.text);
    if (amountCents == null) return;

    final existing = widget.initialDeadline;
    final now = DateTime.now();
    Navigator.of(context).pop(
      Deadline(
        id: existing?.id ?? now.microsecondsSinceEpoch.toString(),
        title: _titleController.text.trim(),
        category: _category,
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        dueDate: DateUtilsHelper.dateOnly(_dueDate),
        recurrenceMonths: _recurrenceMonths,
        amountCents: amountCents,
        reminderDays: existing?.reminderDays ?? const [7, 1],
        isCompleted: existing?.isCompleted ?? false,
        isArchived: false,
        source: existing?.source,
        catalogItemId: existing?.catalogItemId,
        profileType: widget.user.profileType,
        userId: widget.user.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialDeadline != null;
    return Scaffold(
      appBar: AppBar(title: Text(isEditing ? 'Modifica scadenza' : 'Nuova scadenza')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              TextFormField(
                controller: _titleController,
                autofocus: !isEditing,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Titolo',
                  border: OutlineInputBorder(),
                ),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Inserisci un titolo.'
                    : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _categories.containsKey(_category) ? _category : 'altro',
                decoration: const InputDecoration(
                  labelText: 'Categoria',
                  border: OutlineInputBorder(),
                ),
                items: _categories.entries
                    .map(
                      (entry) => DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => _category = value);
                },
              ),
              const SizedBox(height: 16),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Data di scadenza'),
                subtitle: Text(
                  MaterialLocalizations.of(context).formatMediumDate(_dueDate),
                ),
                trailing: const Icon(Icons.calendar_month),
                onTap: _selectDate,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<int>(
                value: _recurrenceOptions.containsKey(_recurrenceMonths)
                    ? _recurrenceMonths
                    : 0,
                decoration: const InputDecoration(
                  labelText: 'Ricorrenza',
                  border: OutlineInputBorder(),
                ),
                items: _recurrenceOptions.entries
                    .map(
                      (entry) => DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _recurrenceMonths = value);
                  }
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amountController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Importo (facoltativo)',
                  prefixText: '€ ',
                  helperText: 'Inserisci al massimo due cifre decimali.',
                  border: OutlineInputBorder(),
                ),
                validator: (value) => parseEuroAmountToCents(value ?? '') == null
                    ? 'Importo non valido. Esempio: 125,50'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note (facoltative)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.save_outlined),
                label: Text(isEditing ? 'Salva modifiche' : 'Aggiungi scadenza'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
