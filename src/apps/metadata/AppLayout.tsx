import Box from '@mui/material/Box';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import React, { FC, StrictMode, useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import AppBody from 'components/AppBody';
import OffsetAppBar from 'components/OffsetAppBar';
import AppToolbar from 'components/toolbar/AppToolbar';
import ServerButton from 'components/toolbar/ServerButton';
import { appRouter } from 'components/router/appRouter';
import ThemeCss from 'components/ThemeCss';
import { useLocale } from 'hooks/useLocale';

import './AppOverrides.scss';

export const Component: FC = () => {
    const { dateFnsLocale } = useLocale();

    // Update body class
    useEffect(() => {
        document.body.classList.add('dashboardDocument');

        return () => {
            document.body.classList.remove('dashboardDocument');
        };
    }, []);

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={dateFnsLocale}>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%'
                }}
            >
                <StrictMode>
                    <OffsetAppBar
                        dense
                        sx={{
                            width: '100%',
                            ml: 0
                        }}
                    >
                        <AppToolbar
                            isBackButtonAvailable={appRouter.canGoBack()}
                            isDrawerAvailable={false}
                            isDrawerOpen={false}
                            className='dashboard-appBar'
                        >
                            <ServerButton />
                        </AppToolbar>
                    </OffsetAppBar>
                </StrictMode>

                <Box
                    component='main'
                    sx={{
                        position: 'relative',
                        width: '100%',
                        flexGrow: 1
                    }}
                >
                    <AppBody>
                        <Outlet />
                    </AppBody>
                </Box>
            </Box>
            <ThemeCss dashboard />
        </LocalizationProvider>
    );
};
