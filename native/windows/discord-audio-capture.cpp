#define WIN32_LEAN_AND_MEAN
#include <Windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <tlhelp32.h>
#include <io.h>
#include <fcntl.h>

#include <algorithm>
#include <cstdio>
#include <cwchar>
#include <string>
#include <unordered_map>
#include <vector>

#pragma comment(lib, "Ole32.lib")
#pragma comment(lib, "Uuid.lib")

namespace {
constexpr DWORD kSampleRate = 48000;
constexpr WORD kChannels = 2;
constexpr WORD kBitsPerSample = 16;
constexpr DWORD kBytesPerFrame = kChannels * (kBitsPerSample / 8);

bool isDiscordExecutable(const wchar_t* name) {
  return _wcsicmp(name, L"Discord.exe") == 0 ||
         _wcsicmp(name, L"DiscordPTB.exe") == 0 ||
         _wcsicmp(name, L"DiscordCanary.exe") == 0;
}

DWORD findDiscordRoot() {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) return 0;

  std::unordered_map<DWORD, DWORD> discordProcesses;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (Process32FirstW(snapshot, &entry)) {
    do {
      if (isDiscordExecutable(entry.szExeFile))
        discordProcesses.emplace(entry.th32ProcessID, entry.th32ParentProcessID);
    } while (Process32NextW(snapshot, &entry));
  }
  CloseHandle(snapshot);

  DWORD root = 0;
  for (const auto& [pid, parent] : discordProcesses) {
    if (discordProcesses.contains(parent)) continue;
    if (root != 0) return 0;
    root = pid;
  }
  return root;
}

class ActivationHandler final : public IActivateAudioInterfaceCompletionHandler,
                                public IAgileObject {
 public:
  explicit ActivationHandler(HANDLE complete) : complete_(complete) {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** object) override {
    if (!object) return E_POINTER;
    if (iid == __uuidof(IAgileObject)) {
      *object = static_cast<IAgileObject*>(this);
      AddRef();
      return S_OK;
    }
    if (iid == __uuidof(IUnknown) ||
        iid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *object = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *object = nullptr;
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override {
    return static_cast<ULONG>(InterlockedIncrement(&references_));
  }

  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG remaining =
        static_cast<ULONG>(InterlockedDecrement(&references_));
    if (remaining == 0) delete this;
    return remaining;
  }

  HRESULT STDMETHODCALLTYPE ActivateCompleted(
      IActivateAudioInterfaceAsyncOperation* operation) override {
    IUnknown* activated = nullptr;
    HRESULT activationResult = E_UNEXPECTED;
    result_ = operation->GetActivateResult(&activationResult, &activated);
    if (SUCCEEDED(result_)) result_ = activationResult;
    if (SUCCEEDED(result_))
      result_ = activated->QueryInterface(__uuidof(IAudioClient),
                                          reinterpret_cast<void**>(&client_));
    if (activated) activated->Release();
    SetEvent(complete_);
    return S_OK;
  }

  HRESULT result() const { return result_; }
  IAudioClient* takeClient() {
    IAudioClient* result = client_;
    client_ = nullptr;
    return result;
  }

 private:
  ~ActivationHandler() {
    if (client_) client_->Release();
  }
  volatile LONG references_ = 1;
  HANDLE complete_;
  HRESULT result_ = E_UNEXPECTED;
  IAudioClient* client_ = nullptr;
};

HRESULT activateExcludedProcess(DWORD processId, IAudioClient** client) {
  HANDLE complete = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!complete) return HRESULT_FROM_WIN32(GetLastError());

  AUDIOCLIENT_ACTIVATION_PARAMS parameters{};
  parameters.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  parameters.ProcessLoopbackParams.TargetProcessId = processId;
  parameters.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activation{};
  activation.vt = VT_BLOB;
  activation.blob.cbSize = sizeof(parameters);
  activation.blob.pBlobData = reinterpret_cast<BYTE*>(&parameters);

  auto* handler = new ActivationHandler(complete);
  IActivateAudioInterfaceAsyncOperation* operation = nullptr;
  HRESULT result = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient),
      &activation, handler, &operation);
  if (SUCCEEDED(result)) {
    WaitForSingleObject(complete, INFINITE);
    result = handler->result();
    if (SUCCEEDED(result)) *client = handler->takeClient();
  }
  if (operation) operation->Release();
  handler->Release();
  CloseHandle(complete);
  return result;
}

bool writeAll(HANDLE output, const void* data, DWORD size) {
  const BYTE* cursor = static_cast<const BYTE*>(data);
  while (size > 0) {
    DWORD written = 0;
    if (!WriteFile(output, cursor, size, &written, nullptr) || written == 0)
      return false;
    cursor += written;
    size -= written;
  }
  return true;
}

bool stopRequested() {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  if (input == INVALID_HANDLE_VALUE || input == nullptr) return false;
  DWORD available = 0;
  if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) return true;
  if (available == 0) return false;
  char command = 0;
  DWORD read = 0;
  return !ReadFile(input, &command, 1, &read, nullptr) || read == 0 ||
         command == 'x';
}

int capture(DWORD processId) {
  HANDLE discordProcess = OpenProcess(SYNCHRONIZE, FALSE, processId);
  if (!discordProcess) {
    std::fprintf(stderr, "ERROR DISCORD_NOT_FOUND_OR_MULTIPLE\n");
    return 20;
  }
  const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(comResult)) {
    std::fprintf(stderr, "ERROR COM_INIT 0x%08lx\n", comResult);
    CloseHandle(discordProcess);
    return 10;
  }

  IAudioClient* client = nullptr;
  HRESULT result = activateExcludedProcess(processId, &client);
  if (FAILED(result) || !client) {
    std::fprintf(stderr, "ERROR LOOPBACK_UNAVAILABLE 0x%08lx\n", result);
    CoUninitialize();
    CloseHandle(discordProcess);
    return 11;
  }

  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = static_cast<WORD>(kBytesPerFrame);
  format.nAvgBytesPerSec = kSampleRate * kBytesPerFrame;

  const DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK |
                      AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                      AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
  result = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, &format,
                              nullptr);
  if (FAILED(result)) {
    std::fprintf(stderr, "ERROR LOOPBACK_INIT 0x%08lx\n", result);
    client->Release();
    CoUninitialize();
    CloseHandle(discordProcess);
    return 12;
  }

  HANDLE audioReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!audioReady) {
    std::fprintf(stderr, "ERROR AUDIO_EVENT 0x%08lx\n", GetLastError());
    client->Release();
    CoUninitialize();
    CloseHandle(discordProcess);
    return 13;
  }
  result = client->SetEventHandle(audioReady);
  IAudioCaptureClient* captureClient = nullptr;
  if (SUCCEEDED(result))
    result = client->GetService(__uuidof(IAudioCaptureClient),
                                reinterpret_cast<void**>(&captureClient));
  if (SUCCEEDED(result)) result = client->Start();
  if (FAILED(result)) {
    std::fprintf(stderr, "ERROR CAPTURE_START 0x%08lx\n", result);
    if (captureClient) captureClient->Release();
    CloseHandle(audioReady);
    client->Release();
    CoUninitialize();
    CloseHandle(discordProcess);
    return 14;
  }

  std::fprintf(stderr, "READY %lu\n", processId);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  bool running = true;
  bool discordChanged = false;
  ULONGLONG lastProcessCheck = 0;
  while (running) {
    const DWORD wait = WaitForSingleObject(audioReady, 100);
    if (wait == WAIT_FAILED || stopRequested()) break;
    if (GetTickCount64() - lastProcessCheck >= 1000) {
      lastProcessCheck = GetTickCount64();
      if (WaitForSingleObject(discordProcess, 0) == WAIT_OBJECT_0 ||
          findDiscordRoot() != processId) {
        std::fprintf(stderr, "ERROR DISCORD_INSTANCE_CHANGED\n");
        discordChanged = true;
        break;
      }
    }
    if (wait != WAIT_OBJECT_0) continue;

    UINT32 packetFrames = 0;
    result = captureClient->GetNextPacketSize(&packetFrames);
    while (SUCCEEDED(result) && packetFrames > 0) {
      BYTE* samples = nullptr;
      UINT32 frames = 0;
      DWORD bufferFlags = 0;
      result = captureClient->GetBuffer(&samples, &frames, &bufferFlags, nullptr,
                                        nullptr);
      if (FAILED(result)) break;
      const DWORD bytes = frames * kBytesPerFrame;
      if (bufferFlags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::vector<BYTE> silence(bytes, 0);
        running = writeAll(output, silence.data(), bytes);
      } else {
        running = writeAll(output, samples, bytes);
      }
      const HRESULT releaseResult = captureClient->ReleaseBuffer(frames);
      if (!running || FAILED(releaseResult)) break;
      result = captureClient->GetNextPacketSize(&packetFrames);
    }
  }

  client->Stop();
  captureClient->Release();
  client->Release();
  CloseHandle(audioReady);
  CoUninitialize();
  CloseHandle(discordProcess);
  return discordChanged ? 15 : 0;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && _wcsicmp(argv[1], L"--capture-discord") == 0) {
    const DWORD processId = findDiscordRoot();
    if (processId == 0) {
      std::fprintf(stderr, "ERROR DISCORD_NOT_FOUND_OR_MULTIPLE\n");
      return 20;
    }
    _setmode(_fileno(stdout), _O_BINARY);
    return capture(processId);
  }
  std::fprintf(stderr, "ERROR INVALID_ARGUMENTS\n");
  return 2;
}
