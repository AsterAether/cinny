import {
  Avatar,
  Box,
  Button,
  color,
  config,
  Icon,
  Icons,
  Input,
  Menu,
  MenuItem,
  Scroll,
  Spinner,
  Switch,
  Text,
  toRem,
} from 'folds';
import React, {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  useCallback,
  useRef,
  useState,
} from 'react';
import { ICreateRoomStateEvent, MatrixError, Preset, Visibility } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { isKeyHotkey } from 'is-hotkey';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCard } from '../../components/sequence-card';
import { addRoomIdToMDirect, getMxIdLocalPart, getMxIdServer, isUserId } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { ErrorCode } from '../../cs-errorcode';
import { millisecondsToMinutes, nameInitials } from '../../utils/common';
import { createRoomEncryptionState } from '../../components/create-room';
import { useAlive } from '../../hooks/useAlive';
import { getDirectRoomPath } from '../../pages/pathUtils';
import { useUserDirectorySearch } from '../../hooks/useUserDirectorySearch';
import { UserAvatar } from '../../components/user-avatar';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';

type CreateChatProps = {
  defaultUserId?: string;
};
export function CreateChat({ defaultUserId }: CreateChatProps) {
  const mx = useMatrixClient();
  const alive = useAlive();
  const navigate = useNavigate();
  const useAuthentication = useMediaAuthentication();
  const inputRef = useRef<HTMLInputElement>(null);

  const [encryption, setEncryption] = useState(true);
  const [invalidUserId, setInvalidUserId] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const directorySearch = useUserDirectorySearch();

  const [createState, create] = useAsyncCallback<string, Error | MatrixError, [string, boolean]>(
    useCallback(
      async (userId, encrypted) => {
        const initialState: ICreateRoomStateEvent[] = [];

        if (encrypted) initialState.push(createRoomEncryptionState());

        const result = await mx.createRoom({
          is_direct: true,
          invite: [userId],
          visibility: Visibility.Private,
          preset: Preset.TrustedPrivateChat,
          initial_state: initialState,
        });

        addRoomIdToMDirect(mx, result.room_id, userId);

        return result.room_id;
      },
      [mx]
    )
  );
  const loading = createState.status === AsyncStatus.Loading;
  const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
  const disabled = createState.status === AsyncStatus.Loading;

  const handleSelectUser = (userId: string) => {
    if (inputRef.current) {
      inputRef.current.value = userId;
      directorySearch.reset();
      setFocusIndex(0);
      inputRef.current.focus();
    }
  };

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setInvalidUserId(false);
    const value = evt.currentTarget.value.trim();

    if (!value || isUserId(value)) {
      directorySearch.reset();
      return;
    }

    const term = value.startsWith('@') ? value.slice(1) : value;
    if (term) {
      directorySearch.search(term);
      setFocusIndex(0);
    } else {
      directorySearch.reset();
    }
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    const { results } = directorySearch;
    if (results.length === 0) return;

    if (isKeyHotkey('arrowdown', evt)) {
      evt.preventDefault();
      setFocusIndex((i) => (i + 1) % results.length);
      return;
    }
    if (isKeyHotkey('arrowup', evt)) {
      evt.preventDefault();
      setFocusIndex((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (isKeyHotkey('tab', evt) || isKeyHotkey('enter', evt)) {
      const selected = results[focusIndex];
      if (selected) {
        evt.preventDefault();
        handleSelectUser(selected.user_id);
      }
      return;
    }
    if (isKeyHotkey('escape', evt)) {
      directorySearch.reset();
      setFocusIndex(0);
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalidUserId(false);

    const target = evt.target as HTMLFormElement | undefined;
    const userIdInput = target?.userIdInput as HTMLInputElement | undefined;
    const userId = userIdInput?.value.trim();

    if (!userIdInput || !userId) return;
    if (!isUserId(userId)) {
      setInvalidUserId(true);
      return;
    }

    create(userId, encryption).then((roomId) => {
      if (alive()) {
        userIdInput.value = '';
        navigate(getDirectRoomPath(roomId));
      }
    });
  };

  const showDropdown =
    directorySearch.loading || directorySearch.results.length > 0 || directorySearch.term;

  return (
    <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
      <Box direction="Column" gap="100">
        <Text size="L400">User ID</Text>
        <div>
          <Input
            ref={inputRef}
            defaultValue={defaultUserId}
            placeholder="@username:server"
            name="userIdInput"
            variant="SurfaceVariant"
            size="500"
            radii="400"
            required
            autoFocus
            autoComplete="off"
            disabled={disabled}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
          />
          {showDropdown && (
            <Box style={{ position: 'relative' }}>
              <Menu
                style={{
                  position: 'absolute',
                  top: config.space.S100,
                  zIndex: 1,
                  width: '100%',
                }}
              >
                <Scroll size="300" style={{ maxHeight: toRem(200) }}>
                  <div style={{ padding: config.space.S100 }}>
                    {directorySearch.loading && directorySearch.results.length === 0 && (
                      <Box justifyContent="Center" style={{ padding: config.space.S200 }}>
                        <Spinner size="200" />
                      </Box>
                    )}
                    {!directorySearch.loading && directorySearch.results.length === 0 && (
                      <Box justifyContent="Center" style={{ padding: config.space.S200 }}>
                        <Text size="T200" priority="300">
                          No users found
                        </Text>
                      </Box>
                    )}
                    {directorySearch.results.map((user, index) => {
                      const avatarUrl = user.avatar_url
                        ? mx.mxcUrlToHttp(
                            user.avatar_url,
                            100,
                            100,
                            'crop',
                            undefined,
                            false,
                            useAuthentication
                          )
                        : undefined;
                      const displayName = user.display_name || getMxIdLocalPart(user.user_id);
                      const server = getMxIdServer(user.user_id);

                      return (
                        <MenuItem
                          key={user.user_id}
                          type="button"
                          size="300"
                          variant={index === focusIndex ? 'Primary' : 'Surface'}
                          radii="300"
                          onClick={() => handleSelectUser(user.user_id)}
                          disabled={disabled}
                          before={
                            <Avatar size="200" radii="400">
                              <UserAvatar
                                userId={user.user_id}
                                src={avatarUrl ?? undefined}
                                alt={displayName}
                                renderFallback={() => (
                                  <Text as="span" size="H6">
                                    {nameInitials(displayName)}
                                  </Text>
                                )}
                              />
                            </Avatar>
                          }
                          after={
                            server && (
                              <Text size="T200" priority="300" truncate>
                                {server}
                              </Text>
                            )
                          }
                        >
                          <Box grow="Yes" direction="Column">
                            <Text size="T300" truncate>
                              <b>{displayName}</b>
                            </Text>
                            <Text size="T200" priority="300" truncate>
                              {user.user_id}
                            </Text>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </div>
                </Scroll>
              </Menu>
            </Box>
          )}
        </div>
        {invalidUserId && (
          <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
            <Icon src={Icons.Warning} filled size="50" />
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>Please enter a valid User ID.</b>
            </Text>
          </Box>
        )}
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">Options</Text>
        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant="SurfaceVariant"
          direction="Column"
          gap="500"
        >
          <SettingTile
            title="End-to-End Encryption"
            description="Once this feature is enabled, it can't be disabled after the room is created."
            after={
              <Switch
                variant="Primary"
                value={encryption}
                onChange={setEncryption}
                disabled={disabled}
              />
            }
          />
        </SequenceCard>
      </Box>
      {error && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
          <Icon src={Icons.Warning} filled size="100" />
          <Text size="T300" style={{ color: color.Critical.Main }}>
            <b>
              {error instanceof MatrixError && error.name === ErrorCode.M_LIMIT_EXCEEDED
                ? `Server rate-limited your request for ${millisecondsToMinutes(
                    (error.data.retry_after_ms as number | undefined) ?? 0
                  )} minutes!`
                : error.message}
            </b>
          </Text>
        </Box>
      )}
      <Box shrink="No" direction="Column" gap="200">
        <Button
          type="submit"
          size="500"
          variant="Primary"
          radii="400"
          disabled={disabled}
          before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
        >
          <Text size="B500">Create</Text>
        </Button>
      </Box>
    </Box>
  );
}
