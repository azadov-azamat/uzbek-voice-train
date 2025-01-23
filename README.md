# Audio Dataset Example

This dataset contains audio recordings and their corresponding transcriptions.

## Dataset Structure
- `audio/`: Directory containing `.ogg` files.
- `metadata.csv`: CSV file with metadata for each audio file.

## Metadata Fields
- `number`: Unique identifier for each sample.
- `transcription`: Transcription of the audio file.
- `file_name`: Name of the audio file in the `audio/` folder.
- `is_correct`: Boolean indicating if the transcription is verified.

## Usage
To load this dataset:
```python
from datasets import Dataset, Audio

dataset = Dataset.from_csv("metadata.csv")
dataset = dataset.cast_column("file_name", Audio(sampling_rate=16_000))
print(dataset[0])
