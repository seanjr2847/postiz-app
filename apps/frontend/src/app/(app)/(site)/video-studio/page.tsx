import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { VideoStudioComponent } from './video-studio.component';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Video Studio`,
  description: '',
};

export default async function Page() {
  return <VideoStudioComponent />;
}
