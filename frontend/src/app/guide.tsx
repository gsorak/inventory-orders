import { ScrollView } from 'react-native';

import { DemoGuide } from '../components/DemoGuide';
import { common } from '../theme';

export default function GuideScreen() {
    return (
        <ScrollView contentContainerStyle={common.screen}>
            <DemoGuide />
        </ScrollView>
    );
}
